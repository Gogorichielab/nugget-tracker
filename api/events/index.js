const { TableClient } = require("@azure/data-tables");
const { v4: uuidv4 } = require("uuid");
const { getRedemptionDate } = require("../utils/redemptionDate");
const { createRateLimiter, getClientIp } = require("../utils/rateLimiter");
const { escapeOData } = require("../utils/odata");

const readLimiter  = createRateLimiter(60, 60_000);   // 60 req / 1 min
const writeLimiter = createRateLimiter(20, 900_000);  // 20 req / 15 min

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const TABLE_NAME = "NuggetEvents";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
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

module.exports = async function (context, req) {
  try {
    const method = req.method.toUpperCase();
    const id = context.bindingData.id;

    const isWrite = method === "POST" || method === "PUT" || method === "DELETE";
    const { allowed, retryAfter } = isWrite
      ? writeLimiter.check(getClientIp(req))
      : readLimiter.check(getClientIp(req));
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
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq '${escapeOData(year)}'` },
      });
      for await (const entity of iter) {
        events.push(rowToEvent(entity));
      }
      events.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
      context.res = { status: 200, body: events };
      return;
    }

    if (!isAdmin(req)) {
      context.res = { status: 401, body: { error: "Unauthorized" } };
      return;
    }

    if (method === "POST") {
      const year = String(new Date(req.body.gameDate).getFullYear());
      const rowKey = uuidv4();
      const entity = eventToRow(req.body, year, rowKey);
      await client.createEntity(entity);
      context.res = { status: 201, body: rowToEvent(entity) };
      return;
    }

    if (method === "PUT" && id) {
      const year = String(new Date(req.body.gameDate).getFullYear());
      const entity = eventToRow(req.body, year, id);
      await client.upsertEntity(entity, "Replace");
      context.res = { status: 200, body: rowToEvent(entity) };
      return;
    }

    if (method === "DELETE" && id) {
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
      context.res = { status: 204 };
      return;
    }

    context.res = { status: 405, body: { error: "Method not allowed" } };
  } catch (error) {
    setInternalError(context, error, "events request failed");
  }
};
