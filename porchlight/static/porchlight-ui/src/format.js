// Small formatting helpers for what the page shows.
import { parseJiraTime } from '@lib/catchup.js';

// parseJiraTime lives with the catch-up rules in the backend's src/lib, because those
// rules need it too. It is exported again here, so page code keeps one place to import from.
export { parseJiraTime };

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Midnight at the start of a date, in the viewer's own time zone. */
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * When a note was saved, in the viewer's time zone:
 * "Today, 09:12", "Yesterday, 16:40", or "28 Oct 2026, 10:12".
 *
 * @param {string} iso - the createdAt the resolver sends, in UTC
 * @param {Date} [now]
 */
export function formatWhen(iso, now = new Date()) {
  const saved = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(saved)) / 86_400_000);
  const time = timeFormat.format(saved);
  if (daysAgo <= 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return `${dateFormat.format(saved)}, ${time}`;
}

/** "Aisha Rahman" → "AR". "Wei" → "W". */
export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => Array.from(part)[0].toUpperCase()).join('');
}

/** 2001 → "2,001". */
export const formatNumber = (n) => n.toLocaleString('en-GB');

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** A Jira time as the viewer's day: "6 Nov". Used for ticket dates and "Added by … · 6 Nov". */
export const formatDay = (value) => dayFormat.format(new Date(parseJiraTime(value)));

/**
 * A plain calendar day ("2026-12-20", no time zone) as "20 Dec", on that same day.
 * It is read as that day in the viewer's zone. new Date("2026-12-20") would read it as
 * midnight UTC, which is 19 Dec for anyone west of London.
 * Used for due dates and for porch light dates ("Away until 20 Nov").
 */
export function formatCalendarDay(isoDay) {
  const [year, month, day] = isoDay.split('-').map(Number);
  return dayFormat.format(new Date(year, month - 1, day));
}

/** A ticket's due date: "Due 20 Dec", or "No due date". Jira sends it as a calendar day. */
export function formatDue(due) {
  if (!due) return 'No due date';
  return `Due ${formatCalendarDay(due)}`;
}

/** Today in the catch-up's header: "10 Nov 2026". */
export const formatFullDate = (date) => dateFormat.format(date);
