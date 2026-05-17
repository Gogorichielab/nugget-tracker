const { getAuthConfigError, verifyLegacyPasswordHeader } = require("../utils/adminAuth");
const { createRateLimiter, getClientIp } = require("../utils/rateLimiter");

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const verifyLimiter = createRateLimiter(5, 900_000, { name: "admin-verify" }); // 5 req / 15 min

module.exports = async function (context, req) {
  const { allowed, retryAfter } = await verifyLimiter.check(getClientIp(req));
  if (!allowed) {
    context.res = {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfter) },
      body: { error: "Too many requests", retryAfter },
    };
    return;
  }

  const authConfigError = getAuthConfigError();
  if (authConfigError) {
    context.res = {
      status: 500,
      headers: NO_STORE_HEADERS,
      body: { error: "Admin authentication misconfigured" },
    };
    return;
  }

  if (!verifyLegacyPasswordHeader(req)) {
    context.res = {
      status: 401,
      headers: NO_STORE_HEADERS,
      body: { error: "Unauthorized" },
    };
    return;
  }

  context.res = {
    status: 200,
    headers: NO_STORE_HEADERS,
    body: {},
  };
};
