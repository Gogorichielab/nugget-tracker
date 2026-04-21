const { v4: uuidv4 } = require("uuid");
const { setInternalError, getClient: _getClient } = require("../shared");

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function getClient() {
  return _getClient(CONNECTION_STRING);
}

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function eventToRow(body, partitionKey, rowKey) {
  const gameDate = body.gameDate;
  const redemptionDate = new Date(gameDate);
  redemptionDate.setDate(redemptionDate.getDate() + 1);
  const rd = redemptionDate.toISOString().split("T")[0];
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

    if (!CONNECTION_STRING) {
      context.res = { status: 500, body: { error: "Storage not configured" } };
      return;
    }

    const client = await getClient();

    if (method === "GET") {
      const year = String(new Date().getFullYear());
      const events = [];
      const iter = client.listEntities({ queryOptions: { filter: `PartitionKey eq '${year}'` } });
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
      const iter = client.listEntities({ queryOptions: { filter: `RowKey eq '${id}'` } });
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
