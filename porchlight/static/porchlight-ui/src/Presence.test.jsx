// Tests for the porch light on screen: the lamp and its text (docs/specs/porch-status.md).
// The text is built from a fixed kind and a date only, never from anything a person typed.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Presence, { statusText } from './Presence.jsx';

afterEach(cleanup);

/** The one .pl-presence element a render produced, or null. */
const presenceIn = (container) => container.querySelector('.pl-presence');

describe('Presence', () => {
  it.each([
    [{ kind: 'away', untilDate: '2026-11-20' }, 'Away until 20 Nov'],
    [{ kind: 'leaving', untilDate: '2027-01-31' }, 'Leaving on 31 Jan'],
    [{ kind: 'left' }, 'Left'],
  ])('shows %j with the porch light on, as "%s"', (status, text) => {
    const { container } = render(<Presence status={status} />);

    const presence = presenceIn(container);
    expect(presence.textContent).toBe(text);
    expect(presence.className).toBe('pl-presence pl-presence--away');
    const lamp = presence.querySelector('.pl-presence__lamp');
    expect(lamp.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows nothing for Here, so a row has no status line', () => {
    const { container } = render(<Presence status={{ kind: 'here' }} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows "Here, porch light off" with the lamp off where Here must be said', () => {
    const { container } = render(<Presence status={{ kind: 'here' }} showHere />);

    const presence = presenceIn(container);
    expect(presence.textContent).toBe('Here, porch light off');
    expect(presence.className).toBe('pl-presence');
  });
});

describe('statusText', () => {
  it('builds the same words the lamp shows, for the toast', () => {
    expect(statusText({ kind: 'away', untilDate: '2026-11-20' })).toBe('Away until 20 Nov');
    expect(statusText({ kind: 'leaving', untilDate: '2027-01-31' })).toBe('Leaving on 31 Jan');
    expect(statusText({ kind: 'left' })).toBe('Left');
  });

  it('shows the picked calendar day, matching the e2e test in UTC', () => {
    // The e2e test writes its expected text with this exact formatter.
    const utcDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    expect(statusText({ kind: 'away', untilDate: '2026-12-01' })).toBe(`Away until ${utcDay.format(new Date('2026-12-01T00:00:00Z'))}`);
  });
});
