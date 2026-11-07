// Tests for the whole page: scenarios 1 and 2 in docs/specs/skeleton.md, page side.
// The Forge bridge only works inside Jira, so ./api.js is replaced with test doubles here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', () => ({
  fetchNotes: vi.fn(),
  saveNote: vi.fn(),
  fetchMyself: vi.fn(),
  fetchDisplayNames: vi.fn(),
}));

import * as api from './api.js';
import NotesPage from './NotesPage.jsx';

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const PRIYA = '712020:priya-nair';

const NAMES = { [AISHA]: 'Aisha Rahman', [DANIEL]: 'Daniel Tan', [PRIYA]: 'Priya Nair' };

const note = (id, authorAccountId, body, createdAt) => ({ id, authorAccountId, body, createdAt });

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchMyself.mockResolvedValue({ accountId: AISHA, displayName: 'Aisha Rahman' });
  api.fetchDisplayNames.mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, NAMES[id]])));
});
afterEach(cleanup);

describe('NotesPage', () => {
  it('shows loading cards first', () => {
    api.fetchNotes.mockReturnValue(new Promise(() => {}));
    render(<NotesPage />);
    expect(screen.getByText('Loading notes…')).toBeTruthy();
  });

  it('shows the empty porch on a first visit, with Save ready (scenario 2)', async () => {
    api.fetchNotes.mockResolvedValue([]);
    render(<NotesPage />);

    expect(await screen.findByText('No notes yet')).toBeTruthy();
    expect(screen.getByText('Leave the first one for the next person.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save note/i }).disabled).toBe(false);
  });

  it("lists everyone's notes newest first, with each author's current name", async () => {
    api.fetchNotes.mockResolvedValue([
      note('3', DANIEL, "Month-end load test runs at 3x normal volume for 2 hours, matching last December's peak.", '2026-11-05T08:40:00.000Z'),
      note('2', AISHA, 'Payments retry 3 times because the bank API times out under load.', '2026-10-28T02:12:00.000Z'),
      note('1', PRIYA, 'Refunds over 30 days need finance sign-off.', '2026-10-21T01:05:00.000Z'),
    ]);
    render(<NotesPage />);

    const cards = await screen.findAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Daniel Tan', 'Aisha Rahman', 'Priya Nair']);
    expect(screen.getByText('3 notes · newest first')).toBeTruthy();
    // Aisha is the viewer, so her name is already known from /myself and is not looked up again.
    expect(api.fetchDisplayNames).toHaveBeenCalledWith([DANIEL, PRIYA]);
  });

  it('puts a saved note at the top with its author and a toast (scenario 1)', async () => {
    const user = userEvent.setup();
    api.fetchNotes.mockResolvedValue([note('1', PRIYA, 'Refunds over 30 days need finance sign-off.', '2026-10-21T01:05:00.000Z')]);
    const text = 'Payments retry 3 times because the bank API times out under load.';
    api.saveNote.mockImplementation(async ({ clientKey }) => ({
      ok: true,
      note: note('2', AISHA, text, new Date().toISOString()),
      clientKey,
    }));
    render(<NotesPage />);
    await screen.findAllByRole('article');

    await user.type(screen.getByLabelText('Note for the next person'), text);
    await user.click(screen.getByRole('button', { name: /save note/i }));

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('heading').textContent).toBe('Aisha Rahman');
    expect(within(cards[0]).getByText(text)).toBeTruthy();
    expect(within(cards[0]).getByText(/^Today, \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain("Note saved. The light's on.");
  });

  it('shows typed text as text, never as HTML', async () => {
    api.fetchNotes.mockResolvedValue([note('1', AISHA, '<img src=x onerror="alert(1)">', '2026-10-21T01:05:00.000Z')]);
    const { container } = render(<NotesPage />);

    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(container.querySelector('article img')).toBeNull();
  });

  it('still lists notes when the name lookup fails', async () => {
    api.fetchNotes.mockResolvedValue([note('1', DANIEL, 'Test plan is in the ticket.', '2026-10-21T01:05:00.000Z')]);
    api.fetchDisplayNames.mockRejectedValue(new Error('403'));
    render(<NotesPage />);

    const [card] = await screen.findAllByRole('article');
    expect(within(card).getByRole('heading').textContent).toBe('A teammate');
  });

  it('keeps the load error after a save, instead of showing one note as the whole list', async () => {
    const user = userEvent.setup();
    api.fetchNotes.mockRejectedValue(new Error('connection refused'));
    api.saveNote.mockImplementation(async () => ({ ok: true, note: note('9', AISHA, 'hello', new Date().toISOString()) }));
    render(<NotesPage />);
    await screen.findByRole('alert');

    await user.type(screen.getByLabelText('Note for the next person'), 'hello');
    await user.click(screen.getByRole('button', { name: /save note/i }));

    expect(await screen.findByText("Note saved. The light's on.")).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load notes.");
    expect(screen.queryByText(/newest first/)).toBeNull();
  });

  it('keeps a note saved while the first load is still running', async () => {
    const user = userEvent.setup();
    let finishLoad;
    api.fetchNotes.mockReturnValue(new Promise((resolve) => { finishLoad = resolve; }));
    api.saveNote.mockImplementation(async () => ({ ok: true, note: note('9', AISHA, 'hello', new Date().toISOString()) }));
    render(<NotesPage />);

    await user.type(screen.getByLabelText('Note for the next person'), 'hello');
    await user.click(screen.getByRole('button', { name: /save note/i }));
    await screen.findByText("Note saved. The light's on.");
    // The list was read before the insert, so it does not contain the new note.
    finishLoad([note('1', PRIYA, 'Refunds over 30 days need finance sign-off.', '2026-10-21T01:05:00.000Z')]);

    await screen.findByText('Refunds over 30 days need finance sign-off.');
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('hello')).toBeTruthy();
  });

  it('says so when the notes cannot be loaded', async () => {
    api.fetchNotes.mockRejectedValue(new Error('connection refused'));
    render(<NotesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't load notes.");
  });
});
