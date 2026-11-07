// Unit tests for the porch light date rules shared by the page and the setMyStatus resolver.
// Scenarios 2 to 5 in docs/specs/porch-status.md. "Today" in these tests is 7 November 2026.
import { describe, it, expect } from 'vitest';
import {
  todayIn,
  isKnownTimeZone,
  addDays,
  checkStatusDate,
  effectiveStatus,
  STATUS_DATE_MESSAGES,
} from '../../src/lib/porch.js';

const KL = 'Asia/Kuala_Lumpur'; // UTC+8 all year, no daylight saving

describe('todayIn', () => {
  it('gives the date in the person\'s own time zone, not in UTC', () => {
    // 16:30 UTC on 20 Nov is already 00:30 on 21 Nov in Kuala Lumpur.
    const now = new Date('2026-11-20T16:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-20');
    expect(todayIn(KL, now)).toBe('2026-11-21');
  });
});

describe('isKnownTimeZone', () => {
  it('accepts a zone that Intl knows and refuses anything else', () => {
    expect(isKnownTimeZone(KL)).toBe(true);
    expect(isKnownTimeZone('UTC')).toBe(true);
    expect(isKnownTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
    expect(isKnownTimeZone(undefined)).toBe(false);
    expect(isKnownTimeZone(8)).toBe(false);
  });
});

describe('addDays', () => {
  it('moves a calendar date forward across months and years', () => {
    expect(addDays('2026-11-07', 1)).toBe('2026-11-08');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-07', 365)).toBe('2027-11-07');
  });
});

describe('checkStatusDate (scenario 5)', () => {
  const today = '2026-11-07';

  it('accepts today and dates up to 365 days ahead', () => {
    expect(checkStatusDate('away', '2026-11-07', today)).toEqual({ ok: true });
    expect(checkStatusDate('away', '2026-11-20', today)).toEqual({ ok: true });
    expect(checkStatusDate('leaving', '2027-11-07', today)).toEqual({ ok: true });
  });

  it('refuses yesterday with "Pick today or a later date."', () => {
    expect(checkStatusDate('away', '2026-11-06', today)).toEqual({
      ok: false,
      error: 'past',
      message: 'Pick today or a later date.',
    });
    expect(checkStatusDate('away', '2026-11-02', today).message).toBe(STATUS_DATE_MESSAGES.past);
  });

  it('refuses 366 days ahead with "Pick a date within a year."', () => {
    expect(checkStatusDate('leaving', '2027-11-08', today)).toEqual({
      ok: false,
      error: 'too_far',
      message: 'Pick a date within a year.',
    });
    expect(checkStatusDate('leaving', '2027-12-10', today).error).toBe('too_far');
  });

  it('needs no date for Here', () => {
    expect(checkStatusDate('here', undefined, today)).toEqual({ ok: true });
  });

  it('refuses a kind that is not on the allow-list', () => {
    expect(checkStatusDate('left', '2026-11-20', today)).toEqual({ ok: false, error: 'bad_kind' });
    expect(checkStatusDate('<b>', '2026-11-20', today)).toEqual({ ok: false, error: 'bad_kind' });
  });

  it('refuses anything that is not a real YYYY-MM-DD date', () => {
    for (const bad of ['', '20 Nov 2026', '2026-11-7', '2026-02-30', '2026-13-01', 20261120, null]) {
      expect(checkStatusDate('away', bad, today)).toEqual({ ok: false, error: 'bad_date' });
    }
  });
});

describe('effectiveStatus', () => {
  const activeInKL = { active: true, timeZone: KL };

  it('is Here when no status is stored (Here is no row)', () => {
    expect(effectiveStatus(null, activeInKL, new Date('2026-11-07T03:00:00Z'))).toEqual({ kind: 'here' });
  });

  it('is Away up to the end of the date, and Here from midnight after it (scenario 2)', () => {
    const row = { kind: 'away', untilDate: '2026-11-20' };
    // 20 Nov 23:59 in Kuala Lumpur is 15:59 UTC.
    expect(effectiveStatus(row, activeInKL, new Date('2026-11-20T15:59:00Z'))).toEqual({
      kind: 'away',
      untilDate: '2026-11-20',
    });
    // 21 Nov 00:00 in Kuala Lumpur is 16:00 UTC on 20 Nov.
    expect(effectiveStatus(row, activeInKL, new Date('2026-11-20T16:00:00Z'))).toEqual({ kind: 'here' });
  });

  it('is Leaving up to the end of the date, and Left from the day after (scenario 3)', () => {
    const row = { kind: 'leaving', untilDate: '2027-01-31' };
    expect(effectiveStatus(row, activeInKL, new Date('2026-11-10T02:00:00Z'))).toEqual({
      kind: 'leaving',
      untilDate: '2027-01-31',
    });
    expect(effectiveStatus(row, activeInKL, new Date('2027-01-31T15:59:00Z')).kind).toBe('leaving');
    expect(effectiveStatus(row, activeInKL, new Date('2027-01-31T16:00:00Z'))).toEqual({ kind: 'left' });
  });

  it('is Left when Jira reports the account with active false, whatever is stored (scenario 4)', () => {
    const now = new Date('2026-11-07T03:00:00Z');
    const deactivated = { active: false, timeZone: KL };
    expect(effectiveStatus(null, deactivated, now)).toEqual({ kind: 'left' });
    expect(effectiveStatus({ kind: 'away', untilDate: '2026-11-20' }, deactivated, now)).toEqual({ kind: 'left' });
  });

  it('never says Left when Jira left the person out of its answer (scenario 4)', () => {
    const now = new Date('2026-11-07T03:00:00Z');
    expect(effectiveStatus(null, undefined, now, KL)).toEqual({ kind: 'here' });
    expect(effectiveStatus({ kind: 'away', untilDate: '2026-11-20' }, undefined, now, KL)).toEqual({
      kind: 'away',
      untilDate: '2026-11-20',
    });
  });

  it('uses the viewer\'s time zone when Jira hides the person\'s own (risk O10)', () => {
    const row = { kind: 'away', untilDate: '2026-11-20' };
    const hidden = { active: true }; // no timeZone in Jira's answer
    // 16:30 UTC on 20 Nov: still 20 Nov in UTC, already 21 Nov in Kuala Lumpur.
    const now = new Date('2026-11-20T16:30:00Z');
    expect(effectiveStatus(row, hidden, now, KL)).toEqual({ kind: 'here' });
    expect(effectiveStatus(row, hidden, now, 'UTC').kind).toBe('away');
  });

  it('falls back to UTC when neither time zone is usable', () => {
    const row = { kind: 'away', untilDate: '2026-11-20' };
    const now = new Date('2026-11-20T16:30:00Z');
    expect(effectiveStatus(row, { active: true, timeZone: 'Not/AZone' }, now, undefined).kind).toBe('away');
  });
});
