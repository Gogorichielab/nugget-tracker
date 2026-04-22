/**
 * Validates and sanitizes input values to prevent injection attacks.
 */

/**
 * Validates that a value is a valid UUID v4 format.
 * UUIDs are commonly used as row keys in Azure Table Storage.
 *
 * @param {string} value - The value to validate
 * @returns {boolean} True if the value is a valid UUID v4
 */
function isValidUUID(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  // UUID v4 format: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates that a value is a valid year (4-digit number).
 *
 * @param {string|number} value - The value to validate
 * @returns {boolean} True if the value is a valid 4-digit year
 */
function isValidYear(value) {
  const yearStr = String(value);
  if (!/^\d{4}$/.test(yearStr)) {
    return false;
  }
  const year = parseInt(yearStr, 10);
  // Reasonable range: 2000-2100
  return year >= 2000 && year <= 2100;
}

/**
 * Validates that a value is a valid date in ISO format (YYYY-MM-DD).
 *
 * @param {string} value - The value to validate
 * @returns {boolean} True if the value is a valid ISO date string
 */
function isValidISODate(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  // ISO date format: YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    return false;
  }
  // Check if it's a valid date
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Validates that a pitcher name is reasonable.
 * Pitcher names should contain only letters, spaces, hyphens, apostrophes, and periods.
 *
 * @param {string} value - The pitcher name to validate
 * @returns {boolean} True if the pitcher name is valid
 */
function isValidPitcherName(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  // Allow letters (including accented), spaces, hyphens, apostrophes, periods
  // Limit length to prevent extremely long names
  if (value.length < 2 || value.length > 100) {
    return false;
  }
  // Allow Unicode letters, spaces, hyphens, apostrophes, periods, and common diacritics
  const nameRegex = /^[\p{L}\s.'\-]+$/u;
  return nameRegex.test(value);
}

/**
 * Validates that a value is a valid inning number.
 *
 * @param {string|number} value - The inning number to validate
 * @returns {boolean} True if the value is a valid inning number (1-20)
 */
function isValidInning(value) {
  const inning = parseInt(value, 10);
  // MLB games typically don't go beyond 20 innings
  return !isNaN(inning) && inning >= 1 && inning <= 20;
}

module.exports = {
  isValidUUID,
  isValidYear,
  isValidISODate,
  isValidPitcherName,
  isValidInning,
};
