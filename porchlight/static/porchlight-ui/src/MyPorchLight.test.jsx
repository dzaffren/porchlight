// Tests for "Your porch light": the viewer's own card and its form (docs/specs/porch-status.md,
// scenarios 1, 2, 3 and 5, page side). The real date rules in @lib/porch.js run here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyPorchLight from './MyPorchLight.jsx';

const KL = 'Asia/Kuala_Lumpur';
const HERE = { kind: 'here' };

let onSave;

beforeEach(() => {
  // Only Date is faked, so timers and user events run as normal.
  // Today is 7 November 2026: noon in Kuala Lumpur.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T04:00:00.000Z'));
  onSave = vi.fn().mockResolvedValue({ ok: true, status: {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const card = () => screen.getByRole('region', { name: 'Your porch light' });

/** Render the card and open its form. */
async function openForm(status = HERE) {
  const user = userEvent.setup();
  render(<MyPorchLight status={status} timeZone={KL} onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Change' }));
  return user;
}

/** Pick a status and, unless it is Here, a date; then Save. */
async function choose(user, kind, date) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), kind);
  if (date) {
    const input = screen.getByLabelText('Date');
    await user.clear(input);
    await user.type(input, date);
  }
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

describe('MyPorchLight', () => {
  it('says the porch light is off, with a Change button', () => {
    render(<MyPorchLight status={HERE} timeZone={KL} onSave={onSave} />);

    expect(within(card()).getByText('Here, porch light off')).toBeTruthy();
    const change = within(card()).getByRole('button', { name: 'Change' });
    expect(change.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the lamp on with its text when away', () => {
    render(<MyPorchLight status={{ kind: 'away', untilDate: '2026-11-20' }} timeZone={KL} onSave={onSave} />);

    expect(card().querySelector('.pl-presence--away').textContent).toBe('Away until 20 Nov');
  });

  it('opens the form in place, with a status, a date and the Away help', async () => {
    await openForm();

    const status = screen.getByRole('combobox', { name: 'Status' });
    expect([...status.options].map((o) => [o.value, o.textContent])).toEqual([
      ['here', 'Here'], ['away', 'Away until'], ['leaving', 'Leaving on'],
    ]);
    expect(status.value).toBe('away');
    expect(screen.getByLabelText('Date').getAttribute('type')).toBe('date');
    expect(screen.getByText('Your porch light turns off by itself after this date.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    // The open form replaces the Change button, so focus moves into the form.
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(document.activeElement).toBe(status);
  });

  it('saves Away until 20 Nov, checked in the viewer\'s own day (scenario 1)', async () => {
    const user = await openForm();

    await choose(user, 'away', '2026-11-20');

    expect(onSave).toHaveBeenCalledWith({ kind: 'away', untilDate: '2026-11-20' });
    // The form closes once the save worked.
    expect(await screen.findByRole('button', { name: 'Change' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
  });

  it('warns that everyone on the team will see Leaving (scenario 3)', async () => {
    const user = await openForm();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'leaving');

    expect(screen.getByText('Everyone on the team will see this.')).toBeTruthy();
  });

  it('hides the date for Here, and saves Here with no date (scenario 2)', async () => {
    const user = await openForm({ kind: 'away', untilDate: '2026-11-20' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'here');
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.getByText('Your porch light is off: teammates just ask you.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ kind: 'here', untilDate: null });
  });

  it('starts from the current choice when changing an Away date', async () => {
    await openForm({ kind: 'away', untilDate: '2026-11-20' });

    expect(screen.getByRole('combobox', { name: 'Status' }).value).toBe('away');
    expect(screen.getByLabelText('Date').value).toBe('2026-11-20');
  });

  it('refuses a date before today and sends nothing (scenario 5)', async () => {
    const user = await openForm();

    await choose(user, 'away', '2026-11-02');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Pick today or a later date.')).toBeTruthy();
    const date = screen.getByLabelText('Date');
    expect(date.getAttribute('aria-invalid')).toBe('true');
    expect(date.closest('.pl-field').className).toContain('pl-field--error');
  });

  it('refuses a date more than a year ahead and sends nothing (scenario 5)', async () => {
    const user = await openForm();

    await choose(user, 'leaving', '2027-12-10');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Pick a date within a year.')).toBeTruthy();
  });

  it('asks for a date when none was picked, and sends nothing', async () => {
    const user = await openForm();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Pick today or a later date.')).toBeTruthy();
  });

  it("checks today in the viewer's own day, not the browser's", async () => {
    // 20:00 UTC on 7 Nov is already 8 Nov in Kuala Lumpur, so 7 Nov has passed there.
    vi.setSystemTime(new Date('2026-11-07T20:00:00.000Z'));
    const user = await openForm();

    await choose(user, 'away', '2026-11-07');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Pick today or a later date.')).toBeTruthy();
  });

  it('clears the date error once the person picks again', async () => {
    const user = await openForm();
    await choose(user, 'away', '2026-11-02');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'leaving');

    expect(screen.queryByText('Pick today or a later date.')).toBeNull();
    expect(screen.getByText('Everyone on the team will see this.')).toBeTruthy();
  });

  it("shows the resolver's own date error under Date", async () => {
    onSave.mockResolvedValue({ ok: false, error: 'too_far' });
    const user = await openForm();

    await choose(user, 'away', '2026-11-20');

    expect(await screen.findByText('Pick a date within a year.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
  });

  it('keeps the form open and says so when the save fails', async () => {
    onSave.mockRejectedValue(new Error('network'));
    const user = await openForm();

    await choose(user, 'away', '2026-11-20');

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't save your porch light. Try again.");
    expect(screen.getByLabelText('Date').value).toBe('2026-11-20');
  });

  it('closes the form on Cancel and sends nothing', async () => {
    const user = await openForm();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Here, porch light off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('has no Change control once the viewer has Left (scenario 3)', () => {
    render(<MyPorchLight status={{ kind: 'left' }} timeZone={KL} onSave={onSave} />);

    expect(within(card()).getByText('Left')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
});
