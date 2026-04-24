/**
 * Escapes a string value for safe use inside an OData filter predicate.
 * Single quotes are doubled per the OData specification so that a value like
 * O'Brien becomes O''Brien and cannot break out of the surrounding quotes.
 *
 * @param {string} value - The raw value to escape.
 * @returns {string} The escaped value, safe to embed between OData single quotes.
 */
function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

module.exports = { escapeOData };
