const { TableClient, TableServiceClient } = require("@azure/data-tables");
const { v4: uuidv4 } = require("uuid");

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const TABLE_NAME = "NuggetEvents";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function getClient() {
  const client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  try {
    await client.createTable();
  } catch (e) {
    // Table already exists — ignore
  }
  return client;
}

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function eventToRow(body, partitionKey, rowKey) {
  const gameDate = body.gameDate; // "YYYY-MM-DD"
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
  const method = req.method.toUpperCase();
  const id = context.bindingData.id; // set by route template for PUT/DELETE

  if (!CONNECTION_STRING) {
    context.res = { status: 500, body: { error: "Storage not configured" } };
    return;
  }

  const client = await getClient();

  // GET /api/events — list current season
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

  // Admin-only routes
  if (!isAdmin(req)) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }

  // POST /api/events — create
  if (method === "POST") {
    const year = String(new Date(req.body.gameDate).getFullYear());
    const rowKey = uuidv4();
    const entity = eventToRow(req.body, year, rowKey);
    await client.createEntity(entity);
    context.res = { status: 201, body: rowToEvent(entity) };
    return;
  }

  // PUT /api/events/{id} — update
  if (method === "PUT" && id) {
    const year = String(new Date(req.body.gameDate).getFullYear());
    const entity = eventToRow(req.body, year, id);
    await client.upsertEntity(entity, "Replace");
    context.res = { status: 200, body: rowToEvent(entity) };
    return;
  }

  // DELETE /api/events/{id} — delete
  if (method === "DELETE" && id) {
    // Find the entity's partitionKey first
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
};
