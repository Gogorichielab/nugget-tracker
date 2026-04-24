function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

module.exports = { escapeODataString };
