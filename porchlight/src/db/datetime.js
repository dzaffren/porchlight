// Turning database times into text the page can read. Used by every table's row mapper.

/**
 * Turn the DATETIME the database returns into an ISO 8601 string in UTC,
 * like "2026-11-06T09:00:00.000Z", which the page can format for the reader.
 * The columns are stored in UTC, so a value without a time zone is read as UTC.
 *
 * @param {string|Date} value
 * @returns {string}
 */
export function toIsoUtc(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = String(value);
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(text);
  return new Date(hasZone ? text : `${text.replace(' ', 'T')}Z`).toISOString();
}
