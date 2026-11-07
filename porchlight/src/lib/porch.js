// The porch light date rules. Both sides use this file, like src/lib/validate.js for notes:
//  - the page (static/porchlight-ui) imports it to show date errors before sending, and to
//    work out what each person's lamp shows right now, and
//  - the setMyStatus resolver runs the same date check again, because a browser can send anything.
//
// What is stored is only what a person chose: "away until a date" or "leaving on a date".
// Here (no row), Here-after-Away and Left are never stored. They are worked out every time a
// status is read, from the stored date, the person's Jira time zone and Jira's `active` flag
// (decision D26). See docs/specs/porch-status.md.

// The kinds a person may store. "here" is not stored: choosing Here deletes the row.
export const STATUS_KINDS = ['away', 'leaving'];

// The kinds a person may choose in the form: the stored kinds, plus "here".
export const CHOOSABLE_KINDS = ['here', ...STATUS_KINDS];

// The furthest date a person may pick, in days after today ("within a year", scenario 5).
export const MAX_DAYS_AHEAD = 365;

// The words the person sees for each date error. The page shows these under the Date field.
export const STATUS_DATE_MESSAGES = {
  past: 'Pick today or a later date.',
  too_far: 'Pick a date within a year.',
};

// Strict "YYYY-MM-DD": four digits, two digits, two digits. A real calendar check follows.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Is this a time zone that Intl knows, such as "Asia/Kuala_Lumpur"?
 * Intl.DateTimeFormat throws a RangeError for a zone it does not know, so we try it.
 *
 * @param {unknown} timeZone - untrusted, so it may not even be a string
 * @returns {boolean}
 */
export function isKnownTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Today's date as "YYYY-MM-DD" in the given time zone.
 * The "en-CA" locale writes dates as YYYY-MM-DD, so the formatter gives the string directly.
 *
 * @param {string} timeZone - a zone Intl knows, for example "Asia/Kuala_Lumpur"
 * @param {Date} now - the moment to ask about; tests pass a fixed one
 * @returns {string}
 */
export function todayIn(timeZone, now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Move a "YYYY-MM-DD" calendar date forward by a number of days.
 * The maths runs in UTC, where every day has exactly 24 hours, so daylight saving cannot
 * shift the answer by a day.
 *
 * @param {string} date - "YYYY-MM-DD"
 * @param {number} days
 * @returns {string} "YYYY-MM-DD"
 */
export function addDays(date, days) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * Is this a real calendar date written as "YYYY-MM-DD"? "2026-02-30" has the right shape
 * but is not a real day, so we build the date and check it comes back unchanged.
 *
 * @param {unknown} date
 * @returns {boolean}
 */
function isRealIsoDate(date) {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) {
    return false;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Check a status choice before it is saved (scenario 5).
 * Rule: the kind is one of CHOOSABLE_KINDS. Here needs no date. Away and Leaving need a real
 * date from today up to MAX_DAYS_AHEAD days ahead, where "today" is the person's own day.
 *
 * "YYYY-MM-DD" strings sort the same way as the dates they name, so plain < and > compare them.
 *
 * @param {unknown} kind - untrusted
 * @param {unknown} date - untrusted
 * @param {string} today - "YYYY-MM-DD" in the person's time zone, from todayIn()
 * @returns {{ ok: true }
 *         | { ok: false, error: 'bad_kind' | 'bad_date' }
 *         | { ok: false, error: 'past' | 'too_far', message: string }}
 *   `bad_kind` and `bad_date` cannot come from the form, only from a changed request, so they
 *   carry no message for a person.
 */
export function checkStatusDate(kind, date, today) {
  if (!CHOOSABLE_KINDS.includes(kind)) {
    return { ok: false, error: 'bad_kind' };
  }
  if (kind === 'here') {
    return { ok: true };
  }
  if (!isRealIsoDate(date)) {
    return { ok: false, error: 'bad_date' };
  }
  if (date < today) {
    return { ok: false, error: 'past', message: STATUS_DATE_MESSAGES.past };
  }
  if (date > addDays(today, MAX_DAYS_AHEAD)) {
    return { ok: false, error: 'too_far', message: STATUS_DATE_MESSAGES.too_far };
  }
  return { ok: true };
}

/**
 * What a person's porch light shows right now.
 *
 * @param {{ kind: 'away' | 'leaving', untilDate: string } | null | undefined} row
 *   the stored choice, or nothing when the person is Here
 * @param {{ active?: boolean, timeZone?: string } | null | undefined} person
 *   what Jira said about the person; undefined when Jira left them out of its answer
 * @param {Date} now
 * @param {string} [fallbackTimeZone] - the viewer's own zone, used when Jira hides the person's
 * @returns {{ kind: 'here' } | { kind: 'left' } | { kind: 'away' | 'leaving', untilDate: string }}
 */
export function effectiveStatus(row, person, now, fallbackTimeZone) {
  // Only an explicit `active: false` means deactivated. A person missing from Jira's answer
  // keeps their stored status: never show a wrong "Left" (risk O3).
  if (person && person.active === false) {
    return { kind: 'left' };
  }
  if (!row) {
    return { kind: 'here' };
  }

  // The person's own day decides when a date has passed (O4). When Jira hides their time
  // zone, use the viewer's; at worst the lamp changes a few hours early or late (O10).
  const zone = [person?.timeZone, fallbackTimeZone].find(isKnownTimeZone) ?? 'UTC';
  const today = todayIn(zone, now);

  if (today <= row.untilDate) {
    return { kind: row.kind, untilDate: row.untilDate };
  }
  // The date has passed: Away ends by itself, Leaving becomes Left for good.
  return row.kind === 'leaving' ? { kind: 'left' } : { kind: 'here' };
}
