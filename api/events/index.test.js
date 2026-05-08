const test = require("node:test");
const assert = require("node:assert/strict");
const { TableClient } = require("@azure/data-tables");

const ORIGINAL_ENV = {
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
  ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET,
};

const ORIGINAL_FROM_CONNECTION_STRING = TableClient.fromConnectionString;

function makeContext(id) {
  const logs = [];
  const log = (message) => logs.push(message);
  log.error = () => {};
  return {
    context: { bindingData: id ? { id } : {}, log },
    logs,
  };
}

function loadHandlerWithClient(client) {
  process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
  process.env.ADMIN_PASSWORD = "StrongAdmin!234";
  process.env.ADMIN_PASSWORD_SALT = "unique-password-salt";
  process.env.ADMIN_TOKEN_SECRET = "this-is-a-very-long-admin-token-secret-12345";

  delete require.cache[require.resolve("../utils/adminAuth")];
  delete require.cache[require.resolve("./index")];

  const limiterRows = new Map();
  const limiterClient = {
    async createTable() {},
    async getEntity(partitionKey, rowKey) {
      const key = `${partitionKey}|${rowKey}`;
      const entity = limiterRows.get(key);
      if (!entity) {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      return { ...entity };
    },
    async createEntity(entity) {
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      if (limiterRows.has(key)) {
        const error = new Error("conflict");
        error.statusCode = 409;
        throw error;
      }
      limiterRows.set(key, { ...entity, etag: "test-etag" });
    },
    async updateEntity(entity, _mode, options = {}) {
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      const existing = limiterRows.get(key);
      if (!existing) {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      if (options.etag && existing.etag !== options.etag) {
        const error = new Error("precondition failed");
        error.statusCode = 412;
        throw error;
      }
      limiterRows.set(key, { ...entity, etag: "test-etag" });
    },
  };

  TableClient.fromConnectionString = (_connectionString, tableName) => (
    tableName === "RateLimits" ? limiterClient : client
  );

  const handler = require("./index");
  const { createAdminToken } = require("../utils/adminAuth");
  return { handler, token: createAdminToken() };
}

function parseAuditLog(logs) {
  const entry = logs.find((message) => message.startsWith("[AUDIT] "));
  assert.ok(entry, "expected an audit log entry");
  return JSON.parse(entry.slice("[AUDIT] ".length));
}

test.afterEach(() => {
  process.env.AZURE_STORAGE_CONNECTION_STRING = ORIGINAL_ENV.AZURE_STORAGE_CONNECTION_STRING;
  process.env.ADMIN_PASSWORD = ORIGINAL_ENV.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD_SALT = ORIGINAL_ENV.ADMIN_PASSWORD_SALT;
  process.env.ADMIN_TOKEN_SECRET = ORIGINAL_ENV.ADMIN_TOKEN_SECRET;
  TableClient.fromConnectionString = ORIGINAL_FROM_CONNECTION_STRING;
  delete require.cache[require.resolve("../utils/adminAuth")];
  delete require.cache[require.resolve("./index")];
});

test("POST writes emit an audit log entry with event attribution", async () => {
  const client = {
    createTable: async () => {},
    createEntity: async () => {},
  };
  const { handler, token } = loadHandlerWithClient(client);
  const { context, logs } = makeContext();

  await handler(context, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-forwarded-for": "203.0.113.9",
    },
    body: {
      gameDate: "2026-05-01",
      pitcher: "Shota Imanaga",
      inning: 5,
    },
  });

  assert.equal(context.res.status, 201);
  const audit = parseAuditLog(logs);
  assert.equal(audit.action, "CREATE");
  assert.equal(audit.resource, "event");
  assert.equal(audit.gameDate, "2026-05-01");
  assert.equal(audit.pitcher, "Shota Imanaga");
  assert.equal(audit.inning, 5);
  assert.match(audit.rowKey, /^[0-9a-f-]{36}$/i);
  assert.match(audit.ipHash, /^[0-9a-f]{12}$/);
  assert.match(audit.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("PUT writes emit an audit log entry with the updated row key", async () => {
  const client = {
    createTable: async () => {},
    upsertEntity: async () => {},
  };
  const { handler, token } = loadHandlerWithClient(client);
  const id = "11111111-1111-1111-1111-111111111111";
  const { context, logs } = makeContext(id);

  await handler(context, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-forwarded-for": "198.51.100.4",
    },
    body: {
      gameDate: "2026-05-02",
      pitcher: "Jameson Taillon",
      inning: 7,
    },
  });

  assert.equal(context.res.status, 200);
  const audit = parseAuditLog(logs);
  assert.equal(audit.action, "UPDATE");
  assert.equal(audit.rowKey, id);
  assert.equal(audit.partitionKey, "2026");
});

test("DELETE writes emit an audit log entry with partition key context", async () => {
  const client = {
    createTable: async () => {},
    listEntities: () => ({
      async *[Symbol.asyncIterator]() {
        yield { partitionKey: "2026", rowKey: "22222222-2222-2222-2222-222222222222" };
      },
    }),
    deleteEntity: async () => {},
  };
  const { handler, token } = loadHandlerWithClient(client);
  const id = "22222222-2222-2222-2222-222222222222";
  const { context, logs } = makeContext(id);

  await handler(context, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${token}`,
      "x-forwarded-for": "192.0.2.5",
    },
  });

  assert.equal(context.res.status, 204);
  const audit = parseAuditLog(logs);
  assert.equal(audit.action, "DELETE");
  assert.equal(audit.rowKey, id);
  assert.equal(audit.partitionKey, "2026");
});
