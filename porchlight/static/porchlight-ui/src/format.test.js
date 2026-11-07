// Tests for the dates the catch-up shows: "6 Nov", "Due 20 Dec", "No due date".
import { describe, it, expect } from 'vitest';
import { formatCalendarDay, formatDay, formatDue, formatFullDate, parseJiraTime } from './format.js';

describe('parseJiraTime', () => {
  it("reads Jira's offset without a colon", () => {
    expect(parseJiraTime('2026-11-06T08:30:00.000+0000')).toBe(Date.parse('2026-11-06T08:30:00.000Z'));
    expect(parseJiraTime('2026-11-06T16:30:00.000+0800')).toBe(Date.parse('2026-11-06T08:30:00.000Z'));
  });
});

describe('formatDay', () => {
  it('shows a Jira time as day and short month', () => {
    // Midday UTC, so it is 6 November in every time zone the tests run in.
    expect(formatDay('2026-11-06T12:00:00.000+0000')).toBe('6 Nov');
  });
});

describe('formatCalendarDay', () => {
  it('shows a calendar day as day and short month, on that same day', () => {
    expect(formatCalendarDay('2026-11-20')).toBe('20 Nov');
    expect(formatCalendarDay('2027-01-31')).toBe('31 Jan');
  });
});

describe('formatDue', () => {
  it('shows a due date as "Due 20 Dec", on that calendar day', () => {
    expect(formatDue('2026-12-20')).toBe('Due 20 Dec');
  });

  it('says so when there is no due date', () => {
    expect(formatDue(null)).toBe('No due date');
  });
});

describe('formatFullDate', () => {
  it('shows today with its year', () => {
    expect(formatFullDate(new Date(2026, 10, 10))).toBe('10 Nov 2026');
  });
});
