/**
 * Escapes a string value for safe use in OData filter queries.
 *
 * OData requires single quotes in string literals to be doubled ('').
 * For example: "O'Malley" becomes "O''Malley"
 *
 * @param {string|number} value - The value to escape
 * @returns {string} The escaped string safe for OData filter interpolation
 *
 * @example
 * escapeOData("John's Team") // Returns: "John''s Team"
 * escapeOData("' or '1' eq '1") // Returns: "'' or ''1'' eq ''1"
 */
function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

module.exports = { escapeOData };
