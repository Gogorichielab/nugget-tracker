const { TableClient } = require("@azure/data-tables");

const DEFAULT_TABLE_NAME = "RateLimits";
const MAX_CONFLICT_RETRIES = 3;
const TABLE_KEY_DISALLOWED = /[\\/#?\u0000-\u001f\u007f-\u009f]/g;

/**
 * Azure Table Storage-backed sliding-window rate limiter.
 *
 * Each limiter stores request timestamps in Azure Table Storage using optimistic
 * concurrency (ETags), so limits survive Azure Functions cold starts and are
 * shared by every Function App instance. Configure the table with
 * RATE_LIMIT_TABLE_NAME, or default to RateLimits. The storage connection uses
 * AZURE_STORAGE_CONNECTION_STRING, matching the rest of the API.
 *
 * destroy() is provided for compatibility with existing call sites and tests.
 *
 * Usage:
 *   const limiter = createRateLimiter(60, 60_000, { name: "events-read" });
 *   const { allowed, retryAfter } = await limiter.check(getClientIp(req));
 *   if (!allowed) { ... return 429 ... }
 *   // On shutdown: limiter.destroy();
 */
function createRateLimiter(limit, windowMs, options = {}) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Rate limiter limit must be a positive integer");
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("Rate limiter windowMs must be a positive integer");
  }

  const tableName = options.tableName || process.env.RATE_LIMIT_TABLE_NAME || DEFAULT_TABLE_NAME;
  const connectionString = options.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
  const partitionKey = sanitizeTableKey(options.name || `${limit}-${windowMs}`);
  const now = options.now || Date.now;
  const clientFactory = options.clientFactory || (() => {
    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is required for rate limiting");
    }
    return TableClient.fromConnectionString(connectionString, tableName);
  });

  let clientPromise;

  async function getClient() {
    if (!clientPromise) {
      const p = Promise.resolve()
        .then(clientFactory)
        .then(async (client) => {
          try {
            await client.createTable();
          } catch (error) {
            if (!isStatus(error, 409)) throw error;
          }
          return client;
        });
      p.catch(() => {
        if (clientPromise === p) clientPromise = null;
      });
      clientPromise = p;
    }
    return clientPromise;
  }

  async function check(ip) {
    const client = await getClient();
    const rowKey = encodeRowKey(ip || "unknown");

    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const checkedAt = now();
      const windowStart = checkedAt - windowMs;
      const existing = await getExistingEntity(client, partitionKey, rowKey);
      const timestamps = existing ? parseTimestamps(existing.Timestamps) : [];
      const active = timestamps.filter((timestamp) => timestamp > windowStart);

      if (active.length >= limit) {
        const retryAfter = Math.ceil((active[0] + windowMs - checkedAt) / 1000);
        if (active.length !== timestamps.length && existing) {
          await tryUpdateEntity(client, existing, active);
        }
        return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
      }

      active.push(checkedAt);
      const saved = existing
        ? await tryUpdateEntity(client, existing, active)
        : await tryCreateEntity(client, partitionKey, rowKey, active);

      if (saved) return { allowed: true, retryAfter: 0 };
    }

    return { allowed: false, retryAfter: Math.max(Math.ceil(windowMs / 1000), 1) };
  }

  function destroy() {
    // no-op; kept for compatibility with existing call sites/tests
  }

  return { check, destroy };
}

async function getExistingEntity(client, partitionKey, rowKey) {
  try {
    return await client.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (isStatus(error, 404)) return null;
    throw error;
  }
}

async function tryCreateEntity(client, partitionKey, rowKey, timestamps) {
  try {
    await client.createEntity({
      partitionKey,
      rowKey,
      Timestamps: JSON.stringify(timestamps),
      UpdatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    if (isStatus(error, 409)) return false;
    throw error;
  }
}

async function tryUpdateEntity(client, existing, timestamps) {
  try {
    await client.updateEntity(
      {
        partitionKey: existing.partitionKey,
        rowKey: existing.rowKey,
        Timestamps: JSON.stringify(timestamps),
        UpdatedAt: new Date().toISOString(),
      },
      "Replace",
      { etag: existing.etag }
    );
    return true;
  } catch (error) {
    if (isStatus(error, 404) || isStatus(error, 412)) return false;
    throw error;
  }
}

function parseTimestamps(value) {
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((timestamp) => Number.isFinite(timestamp));
  } catch (_) {
    return [];
  }
}

function sanitizeTableKey(value) {
  const key = String(value).trim().replace(TABLE_KEY_DISALLOWED, "-");
  return key || "default";
}

function encodeRowKey(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function isStatus(error, statusCode) {
  return error && (error.statusCode === statusCode || error.status === statusCode);
}

/**
 * Extract the real client IP from an Azure Functions request.
 * This app is deployed behind the trusted Azure Static Web Apps / Azure
 * Front Door edge, which appends the client socket IP to any existing
 * x-forwarded-for value. Because clients can spoof leftmost XFF entries
 * before the request reaches Azure, trust the rightmost non-empty XFF entry
 * added by the edge, then fall back to trusted platform-provided headers.
 */
function getClientIp(req) {
  const headers = req.headers ?? {};
  const xff = headers["x-forwarded-for"];
  const xffEntries = typeof xff === "string"
    ? xff.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];

  if (xffEntries.length > 0) return xffEntries[xffEntries.length - 1];

  const azureClientIp = headers["x-azure-clientip"];
  if (typeof azureClientIp === "string" && azureClientIp.trim()) return azureClientIp.trim();

  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();

  return "unknown";
}

module.exports = { createRateLimiter, getClientIp };
