const {
  TOKEN_TTL_SECONDS,
  createAdminToken,
  getAuthConfigError,
  verifyAdminPassword,
} = require("../utils/adminAuth");

module.exports = async function (context, req) {
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
