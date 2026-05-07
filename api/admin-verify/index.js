const { getAuthConfigError, verifyLegacyPasswordHeader } = require("../utils/adminAuth");

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

module.exports = async function (context, req) {
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
