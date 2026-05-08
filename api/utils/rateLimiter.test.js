const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter, getClientIp } = require("./rateLimiter");

function requestWithHeaders(headers = {}) {
  return { headers };
}

test("getClientIp returns a single XFF value", () => {
  const ip = getClientIp(requestWithHeaders({ "x-forwarded-for": "203.0.113.10" }));

  assert.equal(ip, "203.0.113.10");
});

test("getClientIp trusts the rightmost XFF value when the leftmost value is attacker-controlled", () => {
  const ip = getClientIp(
    requestWithHeaders({ "x-forwarded-for": "198.51.100.200, 203.0.113.10" })
  );

  assert.equal(ip, "203.0.113.10");
});

test("getClientIp ignores blank comma-separated XFF values", () => {
  const ip = getClientIp(
    requestWithHeaders({ "x-forwarded-for": " , 198.51.100.200, , 203.0.113.10, " })
  );

  assert.equal(ip, "203.0.113.10");
});

test("getClientIp falls back to trusted platform headers when XFF is unusable", () => {
  const azureIp = getClientIp(
    requestWithHeaders({
      "x-forwarded-for": " , , ",
      "x-azure-clientip": " 203.0.113.20 ",
      "x-real-ip": "203.0.113.30",
    })
  );
  const realIp = getClientIp(requestWithHeaders({ "x-real-ip": " 203.0.113.30 " }));

  assert.equal(azureIp, "203.0.113.20");
  assert.equal(realIp, "203.0.113.30");
});

test("getClientIp returns unknown when no usable headers are present", () => {
  const blankHeaders = getClientIp(
    requestWithHeaders({
      "x-forwarded-for": " , , ",
      "x-azure-clientip": " ",
      "x-real-ip": "",
    })
  );
  const missingHeaders = getClientIp(requestWithHeaders());

  assert.equal(blankHeaders, "unknown");
  assert.equal(missingHeaders, "unknown");
});

function createFakeTableClient() {
  const rows = new Map();
  let version = 0;
  return {
    rows,
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
      rows.set(key, { ...entity, etag: `W/\"${++version}\"` });
    },
    async updateEntity(entity, _mode, options = {}) {
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      const current = rows.get(key);
      if (!current) {
        const error = new Error("not found");
        error.statusCode = 404;
        throw error;
      }
      if (options.etag && current.etag !== options.etag) {
        const error = new Error("precondition failed");
        error.statusCode = 412;
        throw error;
      }
      rows.set(key, { ...entity, etag: `W/\"${++version}\"` });
    },
  };
}

test("createRateLimiter persists counts in the table client", async () => {
  let currentTime = 1_000;
  const tableClient = createFakeTableClient();
  const limiter = createRateLimiter(2, 60_000, {
    name: "test-limiter",
    clientFactory: () => tableClient,
    now: () => currentTime,
  });

  assert.deepEqual(await limiter.check("203.0.113.10"), { allowed: true, retryAfter: 0 });
  currentTime += 1_000;
  assert.deepEqual(await limiter.check("203.0.113.10"), { allowed: true, retryAfter: 0 });
  currentTime += 1_000;
  assert.deepEqual(await limiter.check("203.0.113.10"), { allowed: false, retryAfter: 58 });

  const rows = [...tableClient.rows.values()];
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].Timestamps).length, 2);
});

test("createRateLimiter prunes expired timestamps before allowing another request", async () => {
  let currentTime = 1_000;
  const tableClient = createFakeTableClient();
  const limiter = createRateLimiter(1, 10_000, {
    name: "test-limiter",
    clientFactory: () => tableClient,
    now: () => currentTime,
  });

  assert.deepEqual(await limiter.check("203.0.113.20"), { allowed: true, retryAfter: 0 });
  currentTime += 5_000;
  assert.deepEqual(await limiter.check("203.0.113.20"), { allowed: false, retryAfter: 5 });
  currentTime += 5_001;
  assert.deepEqual(await limiter.check("203.0.113.20"), { allowed: true, retryAfter: 0 });

  const [row] = [...tableClient.rows.values()];
  assert.deepEqual(JSON.parse(row.Timestamps), [11_001]);
});

test("createRateLimiter returns check and destroy methods", () => {
  const limiter = createRateLimiter(5, 1000);

  assert.equal(typeof limiter.check, "function");
  assert.equal(typeof limiter.destroy, "function");

  limiter.destroy();
});

test("createRateLimiter.destroy clears the interval without throwing", () => {
  const limiter = createRateLimiter(5, 1000);

  assert.doesNotThrow(() => {
    limiter.destroy();
  });
});
