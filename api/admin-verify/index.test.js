const test = require("node:test");
const assert = require("node:assert/strict");

const ORIGINAL_ENV = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
  ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET,
};

function loadHandler({ adminPassword, adminPasswordSalt, adminTokenSecret }) {
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.ADMIN_PASSWORD_SALT = adminPasswordSalt;
  process.env.ADMIN_TOKEN_SECRET = adminTokenSecret;

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
  process.env.ADMIN_PASSWORD = ORIGINAL_ENV.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD_SALT = ORIGINAL_ENV.ADMIN_PASSWORD_SALT;
  process.env.ADMIN_TOKEN_SECRET = ORIGINAL_ENV.ADMIN_TOKEN_SECRET;
  delete require.cache[require.resolve("../utils/adminAuth")];
  delete require.cache[require.resolve("./index")];
});

test("admin verify returns 200 for a valid password header without a body write", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    headers: { "x-admin-password": "StrongAdmin!234" },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {});
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("admin verify returns 401 for an invalid password header", async () => {
  const handler = loadHandler({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    headers: { "x-admin-password": "wrong-password" },
  });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("admin verify returns 500 when authentication is misconfigured", async () => {
  const handler = loadHandler({
    adminPassword: "short",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  const res = await invoke(handler, {
    headers: { "x-admin-password": "short" },
  });

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: "Admin authentication misconfigured" });
  assert.equal(res.headers["Cache-Control"], "no-store");
});
