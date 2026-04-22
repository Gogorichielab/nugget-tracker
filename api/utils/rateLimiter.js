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

  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of store) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) store.delete(ip);
      else store.set(ip, fresh);
    }
  }, cleanupIntervalMs);

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
 * x-forwarded-for may be a comma-separated list (client, proxy1, proxy2…);
 * the first value is always the originating client.
 */
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

module.exports = { createRateLimiter, getClientIp };
