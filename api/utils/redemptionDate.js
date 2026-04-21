/**
 * Returns the redemption date for a given game date string (YYYY-MM-DD).
 * If the game falls on a Saturday (UTC), the redemption date is the following
 * Monday (+2 days); otherwise it is the next day (+1).
 *
 * All arithmetic uses UTC methods so the result is timezone-independent.
 *
 * @param {string} gameDateStr - ISO date string, e.g. "2025-07-05"
 * @returns {string} Redemption date as "YYYY-MM-DD"
 */
function getRedemptionDate(gameDateStr) {
  const d = new Date(gameDateStr);
  const daysToAdd = d.getUTCDay() === 6 ? 2 : 1; // Saturday (6) -> Monday
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d.toISOString().split("T")[0];
}

module.exports = { getRedemptionDate };
