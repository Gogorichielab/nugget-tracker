const crypto = require("crypto");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "";
const ADMIN_PASSWORD_SALT =
  process.env.ADMIN_PASSWORD_SALT || "nugget-tracker-admin-password-salt-v1";
const MIN_PASSWORD_LENGTH = 12;
const TOKEN_TTL_SECONDS = 60 * 60;

function passwordPolicyError(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasNumber || !hasSymbol) {
    return "ADMIN_PASSWORD must include uppercase, lowercase, number, and symbol";
  }
  return null;
}

function hashPassword(password) {
  return crypto.scryptSync(password, ADMIN_PASSWORD_SALT, 32);
}

const ADMIN_PASSWORD_POLICY_ERROR = passwordPolicyError(ADMIN_PASSWORD);
const ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_POLICY_ERROR ? null : hashPassword(ADMIN_PASSWORD);

function safeBufferEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right)) return false;
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyAdminPassword(password) {
  if (!ADMIN_PASSWORD_HASH || typeof password !== "string") return false;
  return safeBufferEqual(hashPassword(password), ADMIN_PASSWORD_HASH);
}

function getLegacyPasswordHeader(req) {
  return req?.headers?.["x-admin-password"] || req?.headers?.["X-Admin-Password"];
}

function verifyLegacyPasswordHeader(req) {
  return verifyAdminPassword(getLegacyPasswordHeader(req));
}

function getBearerToken(req) {
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function getTokenSecretError() {
  if (ADMIN_TOKEN_SECRET.length < 32) {
    return "ADMIN_TOKEN_SECRET must be at least 32 characters";
  }
  return null;
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function createAdminToken() {
  const tokenSecretError = getTokenSecretError();
  if (tokenSecretError) throw new Error(tokenSecretError);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "admin",
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyAdminToken(token) {
  const tokenSecretError = getTokenSecretError();
  if (tokenSecretError || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return false;

  const expectedSignature = signPayload(encodedPayload);
  if (
    !safeBufferEqual(
      Buffer.from(providedSignature, "utf8"),
      Buffer.from(expectedSignature, "utf8")
    )
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload?.sub !== "admin" || !Number.isInteger(payload?.exp)) return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function verifyAdminBearerToken(req) {
  return verifyAdminToken(getBearerToken(req));
}

function getAuthConfigError() {
  return ADMIN_PASSWORD_POLICY_ERROR || getTokenSecretError();
}

module.exports = {
  TOKEN_TTL_SECONDS,
  getAuthConfigError,
  getBearerToken,
  getLegacyPasswordHeader,
  verifyAdminPassword,
  verifyLegacyPasswordHeader,
  createAdminToken,
  verifyAdminBearerToken,
};
