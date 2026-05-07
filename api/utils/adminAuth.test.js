const test = require("node:test");
const assert = require("node:assert/strict");

const ORIGINAL_ENV = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_PASSWORD_SALT: process.env.ADMIN_PASSWORD_SALT,
  ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET,
};

function loadAdminAuth({ adminPassword, adminPasswordSalt, adminTokenSecret }) {
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.ADMIN_PASSWORD_SALT = adminPasswordSalt;
  process.env.ADMIN_TOKEN_SECRET = adminTokenSecret;
  const modulePath = require.resolve("./adminAuth");
  delete require.cache[modulePath];
  return require("./adminAuth");
}

test.after(() => {
  process.env.ADMIN_PASSWORD = ORIGINAL_ENV.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD_SALT = ORIGINAL_ENV.ADMIN_PASSWORD_SALT;
  process.env.ADMIN_TOKEN_SECRET = ORIGINAL_ENV.ADMIN_TOKEN_SECRET;
  delete require.cache[require.resolve("./adminAuth")];
});

test("verifyAdminPassword validates using hash-based comparison", () => {
  const auth = loadAdminAuth({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  assert.equal(auth.verifyAdminPassword("StrongAdmin!234"), true);
  assert.equal(auth.verifyAdminPassword("wrong-password"), false);
});

test("createAdminToken and verifyAdminBearerToken accept valid bearer token", () => {
  const auth = loadAdminAuth({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });
  const token = auth.createAdminToken();

  assert.equal(
    auth.verifyAdminBearerToken({ headers: { authorization: `Bearer ${token}` } }),
    true
  );
});

test("verifyAdminBearerToken rejects malformed bearer token", () => {
  const auth = loadAdminAuth({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  assert.equal(
    auth.verifyAdminBearerToken({ headers: { authorization: "Bearer not-a-valid-token" } }),
    false
  );
});

test("verifyLegacyPasswordHeader supports hashed password validation", () => {
  const auth = loadAdminAuth({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  assert.equal(
    auth.verifyLegacyPasswordHeader({ headers: { "x-admin-password": "StrongAdmin!234" } }),
    true
  );
});

test("getAuthConfigError fails for weak admin password policy", () => {
  const auth = loadAdminAuth({
    adminPassword: "short",
    adminPasswordSalt: "unique-password-salt",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  assert.match(auth.getAuthConfigError(), /ADMIN_PASSWORD must be at least/);
});

test("getAuthConfigError fails for missing password salt", () => {
  const auth = loadAdminAuth({
    adminPassword: "StrongAdmin!234",
    adminPasswordSalt: "",
    adminTokenSecret: "this-is-a-very-long-admin-token-secret-12345",
  });

  assert.match(auth.getAuthConfigError(), /ADMIN_PASSWORD_SALT must be at least/);
});
