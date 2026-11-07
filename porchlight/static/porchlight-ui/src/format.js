// Small formatting helpers for what the page shows.

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
