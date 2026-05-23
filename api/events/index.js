const { TableClient } = require("@azure/data-tables");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getRedemptionDate } = require("../utils/redemptionDate");
const { createRateLimiter, getClientIp } = require("../utils/rateLimiter");
const { escapeOData } = require("../utils/odata");
const { getAuthConfigError, verifyAdminBearerToken } = require("../utils/adminAuth");

const readLimiter  = createRateLimiter(60, 60_000, { name: "events-read" });   // 60 req / 1 min
const writeLimiter = createRateLimiter(20, 900_000, { name: "events-write" });  // 20 req / 15 min

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const TABLE_NAME = "NuggetEvents";
function setInternalError(context, error, message) {
  const errorId = uuidv4();
  context.log.error(`events error [${errorId}]`, error);
  context.res = {
    status: 500,
    body: {
      error: message,
      errorId,
    },
  };
}

async function getClient() {
  const client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  try {
    await client.createTable();
  } catch (_) {}
  return client;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEvent(body) {
  if (!body) return "Request body is required";
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!body.gameDate || !dateRe.test(body.gameDate)) return "Invalid gameDate";
  if (!body.pitcher || typeof body.pitcher !== "string" || body.pitcher.trim().length === 0 || body.pitcher.length > 100) return "Invalid pitcher";
  const inn = parseInt(body.inning, 10);
  if (!Number.isInteger(inn) || inn < 1 || inn > 20) return "Invalid inning";
  return null;
}

function eventToRow(body, partitionKey, rowKey) {
  const gameDate = body.gameDate;
  const rd = getRedemptionDate(gameDate);
  return {
    partitionKey,
    rowKey,
    GameDate: gameDate,
    RedemptionDate: rd,
    Pitcher: body.pitcher,
    Inning: parseInt(body.inning, 10),
  };
}

function rowToEvent(entity) {
  return {
    id: entity.rowKey,
    year: entity.partitionKey,
    gameDate: entity.GameDate,
    redemptionDate: entity.RedemptionDate,
    pitcher: entity.Pitcher,
    inning: entity.Inning,
  };
}

function getClientIpHash(req) {
  return crypto.createHash("sha256").update(getClientIp(req)).digest("hex").slice(0, 12);
}

function logAudit(context, req, action, details) {
  context.log(`[AUDIT] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    action,
    resource: "event",
    ipHash: getClientIpHash(req),
    ...details,
  })}`);
}

module.exports = async function (context, req) {
  try {
    const method = req.method.toUpperCase();
    const id = context.bindingData.id;

    const isWrite = method === "POST" || method === "PUT" || method === "DELETE";
    const { allowed, retryAfter } = isWrite
      ? await writeLimiter.check(getClientIp(req))
      : await readLimiter.check(getClientIp(req));
    if (!allowed) {
      context.res = {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
        body: { error: "Too many requests", retryAfter },
      };
      return;
    }

    if (!CONNECTION_STRING) {
      context.res = { status: 500, body: { error: "Storage not configured" } };
      return;
    }

    const client = await getClient();

    if (method === "GET") {
      const year = String(new Date().getFullYear());
      const events = [];
      try {
        const iter = client.listEntities({
          queryOptions: { filter: `PartitionKey eq '${escapeOData(year)}'` },
        });
        for await (const entity of iter) {
          events.push(rowToEvent(entity));
        }
      } catch (storageError) {
        const errorId = uuidv4();
        context.log.error(`[events-read error ${errorId}]`, storageError);
        context.res = {
          status: 503,
          body: {
            error: "Storage unavailable",
            hint: storageError.statusCode === 404
              ? "Table does not exist — check that NuggetEvents table was created in your storage account"
              : "Could not reach Azure Table Storage — verify AZURE_STORAGE_CONNECTION_STRING and storage account status",
            errorId,
          },
        };
        return;
      }
      events.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
      context.res = { status: 200, body: events };
      return;
    }

    const authConfigError = getAuthConfigError();
    if (authConfigError) {
      context.res = { status: 500, body: { error: "Admin authentication misconfigured" } };
      return;
    }

    if (!verifyAdminBearerToken(req)) {
      context.res = { status: 401, body: { error: "Unauthorized" } };
      return;
    }

    if (method === "POST") {
      const validationError = validateEvent(req.body);
      if (validationError) {
        context.res = { status: 400, body: { error: validationError } };
        return;
      }
      const year = String(new Date(req.body.gameDate).getFullYear());
      const rowKey = uuidv4();
      const entity = eventToRow(req.body, year, rowKey);
      await client.createEntity(entity);
      logAudit(context, req, "CREATE", {
        rowKey,
        partitionKey: entity.partitionKey,
        gameDate: entity.GameDate,
        pitcher: entity.Pitcher,
        inning: entity.Inning,
      });
      context.res = { status: 201, body: rowToEvent(entity) };
      return;
    }

    if (method === "PUT" && id) {
      if (!UUID_RE.test(id)) {
        context.res = { status: 400, body: { error: "Invalid id" } };
        return;
      }
      const validationError = validateEvent(req.body);
      if (validationError) {
        context.res = { status: 400, body: { error: validationError } };
        return;
      }
      const year = String(new Date(req.body.gameDate).getFullYear());
      const entity = eventToRow(req.body, year, id);
      await client.upsertEntity(entity, "Replace");
      logAudit(context, req, "UPDATE", {
        rowKey: id,
        partitionKey: entity.partitionKey,
        gameDate: entity.GameDate,
        pitcher: entity.Pitcher,
        inning: entity.Inning,
      });
      context.res = { status: 200, body: rowToEvent(entity) };
      return;
    }

    if (method === "DELETE" && id) {
      if (!UUID_RE.test(id)) {
        context.res = { status: 400, body: { error: "Invalid id" } };
        return;
      }
      const iter = client.listEntities({ queryOptions: { filter: `RowKey eq '${escapeOData(id)}'` } });
      let found = null;
      for await (const entity of iter) {
        found = entity;
        break;
      }
      if (!found) {
        context.res = { status: 404, body: { error: "Not found" } };
        return;
      }
      await client.deleteEntity(found.partitionKey, id);
      logAudit(context, req, "DELETE", {
        rowKey: id,
        partitionKey: found.partitionKey,
      });
      context.res = { status: 204 };
      return;
    }

    context.res = { status: 405, body: { error: "Method not allowed" } };
  } catch (error) {
    setInternalError(context, error, "events request failed");
  }
};
