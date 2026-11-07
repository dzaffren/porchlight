// Tests for the note box: scenarios 3, 4 and 5 in docs/specs/skeleton.md, page side.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Composer from './Composer.jsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

afterEach(cleanup);

function setup(onSave = vi.fn().mockResolvedValue({ ok: true })) {
  const user = userEvent.setup();
  render(<Composer authorName="Aisha Rahman" onSave={onSave} />);
  return {
    user,
    onSave,
    box: screen.getByLabelText('Note for the next person'),
    saveButton: screen.getByRole('button', { name: /save note/i }),
  };
}

describe('Composer', () => {
  it('shows who the note is saved as, and an empty counter', () => {
    setup();
    expect(screen.getByText('Aisha Rahman')).toBeTruthy();
    expect(screen.getByText('0 / 2,000')).toBeTruthy();
  });

  it('refuses an empty note (scenario 3)', async () => {
    const { user, onSave, saveButton } = setup();

    await user.click(saveButton);

    expect(screen.getByText('Write something first.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a note of only spaces (scenario 3)', async () => {
    const { user, onSave, box, saveButton } = setup();

    await user.type(box, '     ');
    await user.click(saveButton);

    expect(screen.getByText('Write something first.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('warns while typing past 2,000 characters, refuses to save, and keeps the text (scenario 4)', async () => {
    const { user, onSave, box, saveButton } = setup();
    const long = 'a'.repeat(2001);

    await user.click(box);
    await user.paste(long);
    expect(screen.getByText('Notes can be up to 2,000 characters. This one is 2,001.')).toBeTruthy();
    expect(screen.getByText('2,001 / 2,000')).toBeTruthy();

    await user.click(saveButton);

    expect(onSave).not.toHaveBeenCalled();
    expect(box.value).toBe(long);
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the warning once the note is short enough again', async () => {
    const { user, box } = setup();
    await user.click(box);
    await user.paste('a'.repeat(2001));

    await user.type(box, '{Backspace}');

    expect(screen.queryByText(/Notes can be up to 2,000 characters/)).toBeNull();
    expect(screen.getByText('Anyone on the team can read this.')).toBeTruthy();
  });

  it('sends the trimmed note with a random client key, then empties the box', async () => {
    const { user, onSave, box, saveButton } = setup();

    await user.type(box, '  Payments retry 3 times because the bank API times out under load.  ');
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [body, clientKey] = onSave.mock.calls[0];
    expect(body).toBe('Payments retry 3 times because the bank API times out under load.');
    expect(clientKey).toMatch(UUID);
    expect(box.value).toBe('');
  });

  it('shows the save error, keeps the text, and retries with the same key (scenario 5)', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ ok: true });
    const { user, box, saveButton } = setup(onSave);
    const text = 'Year-end batch job runs on 31 Dec at 23:00.';

    await user.type(box, text);
    await user.click(saveButton);

    expect(screen.getByRole('alert').textContent).toContain("Couldn't save your note. Try again.");
    expect(box.value).toBe(text);

    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][1]).toBe(onSave.mock.calls[0][1]); // same client key on the retry
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box.value).toBe('');
  });

  it('uses a new key for the next note after a save works', async () => {
    const { user, onSave, box, saveButton } = setup();

    await user.type(box, 'First');
    await user.click(saveButton);
    await user.type(box, 'Second');
    await user.click(saveButton);

    expect(onSave.mock.calls[1][1]).not.toBe(onSave.mock.calls[0][1]);
  });

  it("shows the server's own length check when the page's check was skipped", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: 'too_long', length: 2001 });
    const { user, box, saveButton } = setup(onSave);

    await user.type(box, 'Short here, but the server disagrees');
    await user.click(saveButton);

    expect(screen.getByText('Notes can be up to 2,000 characters. This one is 2,001.')).toBeTruthy();
    expect(box.value).toBe('Short here, but the server disagrees');
  });

  it('disables Save and says "Saving" while the save is in flight', async () => {
    let finish;
    const onSave = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { user, box, saveButton } = setup(onSave);

    await user.type(box, 'Slow network');
    await user.click(saveButton);

    expect(saveButton.disabled).toBe(true);
    expect(saveButton.textContent).toContain('Saving');
    finish({ ok: true });
  });
});
