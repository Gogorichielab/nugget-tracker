const {
  TOKEN_TTL_SECONDS,
  createAdminToken,
  getAuthConfigError,
  verifyAdminPassword,
} = require("../utils/adminAuth");
const { createRateLimiter, getClientIp } = require("../utils/rateLimiter");

const authLimiter = createRateLimiter(5, 900_000, { name: "auth" }); // 5 req / 15 min

module.exports = async function (context, req) {
  const { allowed, retryAfter } = await authLimiter.check(getClientIp(req));
  if (!allowed) {
    context.res = {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
      body: { error: "Too many requests", retryAfter },
    };
    return;
  }

  const authConfigError = getAuthConfigError();
  if (authConfigError) {
    context.res = {
      status: 500,
      body: { error: "Admin authentication misconfigured" },
    };
    return;
  }

  const password = req?.body?.password;
  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    context.res = {
      status: 401,
      body: { error: "Unauthorized" },
    };
    return;
  }

  context.res = {
    status: 200,
    body: {
      token: createAdminToken(),
      expiresIn: TOKEN_TTL_SECONDS,
      tokenType: "Bearer",
    },
  };
};
