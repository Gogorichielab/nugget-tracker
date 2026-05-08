/**
 * Sliding-window in-memory rate limiter.
 *
 * Each limiter instance tracks request timestamps per IP using a Map.
 * Requests older than windowMs are pruned on every check; a background
 * interval evicts entirely idle IPs to prevent unbounded memory growth.
 *
 * Usage:
 *   const limiter = createRateLimiter(60, 60_000);
 *   const { allowed, retryAfter } = limiter.check(getClientIp(req));
 *   if (!allowed) { ... return 429 ... }
 */

function createRateLimiter(limit, windowMs, cleanupIntervalMs = 300_000) {
  const store = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of store) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) store.delete(ip);
      else store.set(ip, fresh);
    }
  }, cleanupIntervalMs);
  cleanupTimer.unref?.();

  function check(ip) {
    const now = Date.now();
    const timestamps = store.get(ip) ?? [];
    const windowStart = now - windowMs;

    // Prune expired entries from the front (timestamps are insertion-ordered / ascending)
    let i = 0;
    while (i < timestamps.length && timestamps[i] <= windowStart) i++;
    const active = i > 0 ? timestamps.slice(i) : timestamps;

    if (active.length >= limit) {
      const retryAfter = Math.ceil((active[0] + windowMs - now) / 1000);
      store.set(ip, active);
      return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
    }

    active.push(now);
    store.set(ip, active);
    return { allowed: true, retryAfter: 0 };
  }

  return { check };
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
