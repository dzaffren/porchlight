// Tests for the route switch (decision D20): Jira's sidebar shows Porchlight > Team and
// Porchlight > Notes, and the page reads which one is open from Forge's history.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

vi.mock('@forge/bridge', () => ({ view: { createHistory: vi.fn() } }));
vi.mock('./api.js', () => ({
  fetchNotes: vi.fn(),
  saveNote: vi.fn(),
  fetchMyself: vi.fn(),
  fetchDisplayNames: vi.fn(),
  fetchTeam: vi.fn(),
  searchUsers: vi.fn(),
}));

import { view } from '@forge/bridge';
import * as api from './api.js';
import App from './App.jsx';

/** A stand-in for Forge's history: a current location and a list of listeners. */
function fakeHistory(pathname) {
  const listeners = [];
  return {
    location: { pathname },
    listen: vi.fn((listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }),
    go(to) {
      this.location = { pathname: to };
      listeners.forEach((listener) => listener({ location: this.location, action: 'PUSH' }));
    },
    listenerCount: () => listeners.length,
  };
}

const TEAM_TEXT = "Catch up on a teammate's work. Porchlight reads it from Jira as you.";

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchNotes.mockResolvedValue([]);
  api.fetchMyself.mockResolvedValue({ accountId: '712020:daniel-tan', displayName: 'Daniel Tan' });
  api.fetchDisplayNames.mockResolvedValue({});
  api.fetchTeam.mockResolvedValue([]);
});
afterEach(cleanup);

describe('App', () => {
  it('shows the note box on /notes', async () => {
    view.createHistory.mockResolvedValue(fakeHistory('/notes'));
    render(<App />);

    expect(await screen.findByLabelText('Note for the next person')).toBeTruthy();
    expect(screen.queryByText(TEAM_TEXT)).toBeNull();
  });

  it.each(['/team', '/', '/something-else'])('shows the Team page on %s', async (pathname) => {
    view.createHistory.mockResolvedValue(fakeHistory(pathname));
    render(<App />);

    expect(await screen.findByText(TEAM_TEXT)).toBeTruthy();
    expect(screen.queryByLabelText('Note for the next person')).toBeNull();
  });

  it('follows the sidebar when the person moves from Team to Notes', async () => {
    const history = fakeHistory('/team');
    view.createHistory.mockResolvedValue(history);
    render(<App />);
    await screen.findByText(TEAM_TEXT);

    act(() => history.go('/notes'));

    expect(await screen.findByLabelText('Note for the next person')).toBeTruthy();
  });

  it('stops listening when the page goes away', async () => {
    const history = fakeHistory('/team');
    view.createHistory.mockResolvedValue(history);
    const { unmount } = render(<App />);
    await screen.findByText(TEAM_TEXT);

    unmount();

    expect(history.listenerCount()).toBe(0);
  });

  it('shows the Team page when Forge cannot give the route', async () => {
    view.createHistory.mockRejectedValue(new Error('not in a page with routes'));
    render(<App />);

    expect(await screen.findByText(TEAM_TEXT)).toBeTruthy();
  });
});
