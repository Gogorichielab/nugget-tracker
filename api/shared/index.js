const { TableClient } = require("@azure/data-tables");
const { v4: uuidv4 } = require("uuid");

const TABLE_NAME = "NuggetEvents";

function setInternalError(context, error, message) {
  const errorId = uuidv4();
  context.log.error(`error [${errorId}]`, error);
  context.res = {
    status: 500,
    body: {
      error: message,
      errorId,
    },
  };
}

async function getClient(connectionString) {
  const client = TableClient.fromConnectionString(connectionString, TABLE_NAME);
  try {
    await client.createTable();
  } catch (_) {}
  return client;
}

module.exports = { setInternalError, getClient };
