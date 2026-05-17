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

function createFakeLimiterClient() {
  const rows = new Map();
  return {
    async createTable() {},
    async getEntity(partitionKey, rowKey) {
      const entity = rows.get(`${partitionKey}|${rowKey}`);
      if (!entity) {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      return { ...entity };
    },
    async createEntity(entity) {
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      if (rows.has(key)) {
        const error = new Error("conflict");
        error.statusCode = 409;
        throw error;
      }
      rows.set(key, { ...entity, etag: "test-etag" });
    },
    async updateEntity(entity, _mode, options = {}) {
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      const existing = rows.get(key);
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
      rows.set(key, { ...entity, etag: "test-etag" });
    },
  };
}

function loadHandler({ adminPassword, adminPasswordSalt, adminTokenSecret }) {
  process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.ADMIN_PASSWORD_SALT = adminPasswordSalt;
  process.env.ADMIN_TOKEN_SECRET = adminTokenSecret;

  TableClient.fromConnectionString = () => createFakeLimiterClient();

  delete require.cache[require.resolve("../utils/rateLimiter")];
  delete require.cache[require.resolve("../utils/adminAuth")];
  delete require.cache[require.resolve("./index")];
  return require("./index");
}

async function invoke(handler, req) {
  const context = {};
  await handler(context, req);
  return context.res;
}

test.after(() => {
  process.env.AZURE_STORAGE_CONNECTION_STRING = ORIGINAL_ENV.AZURE_STORAGE_CONNECTION_STRING;
  process.env.ADMIN_PASSWORD = ORIGINAL_ENV.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD_SALT = ORIGINAL_ENV.ADMIN_PASSWORD_SALT;
  process.env.ADMIN_TOKEN_SECRET = ORIGINAL_ENV.ADMIN_TOKEN_SECRET;
  TableClient.fromConnectionString = ORIGINAL_FROM_CONNECTION_STRING;
  delete require.cache[require.resolve("../utils/rateLimiter")];
  delete require.cache[require.resolve("../utils/adminAuth")];
  delete require.cache[require.resolve("./index")];
});

test("auth issues a bearer token for the correct password", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    body: { password: "StrongAdmin!234" },
    headers: { "x-forwarded-for": "203.0.113.20" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.tokenType, "Bearer");
  assert.equal(typeof res.body.token, "string");
  assert.ok(res.body.token.length > 0);
  assert.equal(typeof res.body.expiresIn, "number");
});

test("auth returns 401 for an incorrect password", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    body: { password: "wrong" },
    headers: { "x-forwarded-for": "203.0.113.21" },
  });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("auth returns 401 when the body is missing or malformed", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, { headers: { "x-forwarded-for": "203.0.113.22" } });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("auth returns 500 when authentication is misconfigured", async () => {
  const handler = loadHandler({
    adminPassword: "short",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    body: { password: "short" },
    headers: { "x-forwarded-for": "203.0.113.23" },
  });

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: "Admin authentication misconfigured" });
});

test("auth returns 429 after exceeding the per-IP rate limit", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const req = { body: { password: "wrong" }, headers: { "x-forwarded-for": "203.0.113.99" } };
  for (let i = 0; i < 5; i++) {
    const res = await invoke(handler, req);
    assert.equal(res.status, 401);
  }

  const res = await invoke(handler, req);
  assert.equal(res.status, 429);
  assert.equal(res.body.error, "Too many requests");
  assert.ok(typeof res.body.retryAfter === "number" && res.body.retryAfter >= 1);
  assert.equal(res.headers["Retry-After"], String(res.body.retryAfter));
});
