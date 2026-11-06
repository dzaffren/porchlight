// Tests for the note cards' "warm up, then rest" behaviour.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import NoteList from './NoteList.jsx';

const note = (id, body) => ({ id, body, authorAccountId: '712020:aisha-rahman', createdAt: '2026-11-06T09:00:00.000Z' });
const NAMES = { '712020:aisha-rahman': 'Aisha Rahman' };
const classesOf = (container) => [...container.querySelectorAll('article')].map((card) => card.className);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NoteList warming', () => {
  it('lets a new note glow, then rest', () => {
    const { container } = render(<NoteList notes={[note('1', 'ok')]} names={NAMES} freshId="1" />);
    expect(classesOf(container)[0]).toContain('pl-warming');

    act(() => vi.advanceTimersByTime(3600));

    expect(classesOf(container)[0]).toContain('pl-card--rest');
  });

  it('rests the first note when a second note is saved before it finished glowing', () => {
    const { container, rerender } = render(<NoteList notes={[note('1', 'ok')]} names={NAMES} freshId="1" />);
    act(() => vi.advanceTimersByTime(1000));

    rerender(<NoteList notes={[note('2', 'done'), note('1', 'ok')]} names={NAMES} freshId="2" />);
    act(() => vi.advanceTimersByTime(3600));

    expect(classesOf(container)).toEqual([
      'pl-card pl-card--lit pl-card--rest',
      'pl-card pl-card--lit pl-card--rest',
    ]);
  });
});
