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
