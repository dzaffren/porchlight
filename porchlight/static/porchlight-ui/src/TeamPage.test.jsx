// Tests for the Team page: scenarios 1 and 2 in docs/specs/catch-up-view.md, page side.
// The Forge bridge only works inside Jira, so ./api.js is replaced with test doubles here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', () => ({
  fetchTeam: vi.fn(),
  addTeammate: vi.fn(),
  removeTeammate: vi.fn(),
  fetchDisplayNames: vi.fn(),
  searchUsers: vi.fn(),
  findFlaggedFieldId: vi.fn(),
  searchOpenWork: vi.fn(),
  countOpenWork: vi.fn(),
  searchRecentActivity: vi.fn(),
  openWorkJql: vi.fn(),
  openInJira: vi.fn(),
  getSiteUrl: vi.fn(),
}));

import * as api from './api.js';
import TeamPage from './TeamPage.jsx';

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const MEI_LING = '712020:mei-ling-goh';
const RAVI = '712020:ravi-kumar';

const NAMES = { [AISHA]: 'Aisha Rahman', [DANIEL]: 'Daniel Tan', [MEI_LING]: 'Mei Ling Goh', [RAVI]: 'Ravi Kumar' };

const member = (accountId, addedByAccountId, addedAt) => ({ accountId, addedByAccountId, addedAt });
const DANIEL_ROW = member(DANIEL, DANIEL, '2026-11-02T12:00:00.000Z');
const AISHA_ROW = member(AISHA, DANIEL, '2026-11-03T12:00:00.000Z');
const RAVI_ROW = member(RAVI, MEI_LING, '2026-11-04T12:00:00.000Z');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchDisplayNames.mockImplementation(async (ids) =>
    Object.fromEntries(ids.filter((id) => NAMES[id]).map((id) => [id, NAMES[id]])));
  api.searchUsers.mockResolvedValue([
    { accountId: AISHA, displayName: 'Aisha Rahman' },
    { accountId: DANIEL, displayName: 'Daniel Tan' },
  ]);
  // The catch-up pane, when a test opens one: nothing in Jira.
  api.findFlaggedFieldId.mockResolvedValue(null);
  api.searchOpenWork.mockResolvedValue({ issues: [], isLast: true });
  api.searchRecentActivity.mockResolvedValue([]);
  api.getSiteUrl.mockResolvedValue('https://handover-demo.atlassian.net');
});
afterEach(cleanup);

const teamList = () => screen.getByRole('list', { name: 'Team' });

describe('TeamPage', () => {
  it('shows the empty porch on a first visit, and the pane asks to pick someone', async () => {
    api.fetchTeam.mockResolvedValue([]);
    render(<TeamPage />);

    expect(await screen.findByText('No one on the team yet')).toBeTruthy();
    expect(screen.getByText('Add the people you work with, so anyone can catch up on their work.')).toBeTruthy();
    expect(screen.getByText('Pick a teammate')).toBeTruthy();
    expect(screen.getByText("Catch up on a teammate's work. Porchlight reads it from Jira as you.")).toBeTruthy();
  });

  it('lists the team with who added each person, looking every name up in one request', async () => {
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW, RAVI_ROW]);
    render(<TeamPage />);

    const aisha = await screen.findByRole('button', { name: 'Catch up on Aisha Rahman' });
    expect(aisha.textContent).toContain('Added by Daniel Tan · 3 Nov');
    expect(screen.getByRole('button', { name: 'Catch up on Ravi Kumar' }).textContent).toContain('Added by Mei Ling Goh · 4 Nov');
    expect(screen.getByText('3 people')).toBeTruthy();
    expect(api.fetchDisplayNames).toHaveBeenCalledTimes(1);
    expect([...api.fetchDisplayNames.mock.calls[0][0]].sort()).toEqual([AISHA, DANIEL, MEI_LING, RAVI].sort());
  });

  it('says "A teammate" when Jira has no name for someone', async () => {
    api.fetchTeam.mockResolvedValue([member('712020:gone', DANIEL, '2026-11-03T12:00:00.000Z')]);
    render(<TeamPage />);

    expect(await screen.findByRole('button', { name: 'Catch up on A teammate' })).toBeTruthy();
  });

  it('says so when the team cannot be loaded', async () => {
    api.fetchTeam.mockRejectedValue(new Error('db down'));
    render(<TeamPage />);

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load the team. Reload the page to try again.");
  });

  it('adds Aisha from a Jira user search (scenario 1)', async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValueOnce([DANIEL_ROW]).mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.addTeammate.mockResolvedValue({ ok: true });
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Daniel Tan' });

    await user.type(screen.getByLabelText('Add a teammate'), 'Aisha');
    const results = await screen.findByRole('list', { name: 'Jira users' });
    expect(api.searchUsers).toHaveBeenLastCalledWith('Aisha');
    // Daniel is already on the team, so he has no Add button.
    expect(within(results).getByText('On the team')).toBeTruthy();
    expect(within(results).queryByRole('button', { name: 'Add Daniel Tan to the team' })).toBeNull();

    await user.click(within(results).getByRole('button', { name: 'Add Aisha Rahman to the team' }));

    expect(api.addTeammate).toHaveBeenCalledWith(AISHA);
    const row = await screen.findByRole('button', { name: 'Catch up on Aisha Rahman' });
    expect(row.textContent).toContain('Added by Daniel Tan');
    expect(await screen.findByText('Aisha Rahman is on the team.')).toBeTruthy();
    expect(screen.getByLabelText('Add a teammate').value).toBe('');
    expect(screen.queryByRole('list', { name: 'Jira users' })).toBeNull();
  });

  it('does not search Jira for a single letter', async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValue([]);
    render(<TeamPage />);
    await screen.findByText('No one on the team yet');

    await user.type(screen.getByLabelText('Add a teammate'), 'A');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(api.searchUsers).not.toHaveBeenCalled();
  });

  it('says Aisha is already on the team when someone added her first, and shows her (scenario 1)', async () => {
    const user = userEvent.setup();
    // Mei Ling added Aisha in another browser after this page loaded.
    const addedByMeiLing = member(AISHA, MEI_LING, '2026-11-07T12:00:00.000Z');
    api.fetchTeam.mockResolvedValueOnce([DANIEL_ROW]).mockResolvedValue([DANIEL_ROW, addedByMeiLing]);
    api.addTeammate.mockResolvedValue({ ok: false, error: 'already_on_team' });
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Daniel Tan' });

    await user.type(screen.getByLabelText('Add a teammate'), 'Aisha');
    await user.click(await screen.findByRole('button', { name: 'Add Aisha Rahman to the team' }));

    expect(await screen.findByText('Aisha Rahman is already on the team.')).toBeTruthy();
    expect(screen.getByLabelText('Add a teammate').getAttribute('aria-invalid')).toBe('true');
    const row = await screen.findByRole('button', { name: 'Catch up on Aisha Rahman' });
    expect(row.textContent).toContain('Added by Mei Ling Goh');
    // The search result now knows she is on the team.
    const results = screen.getByRole('list', { name: 'Jira users' });
    await waitFor(() => expect(within(results).queryByRole('button', { name: 'Add Aisha Rahman to the team' })).toBeNull());
  });

  it('keeps a removed person off the list when an earlier reload answers late', async () => {
    const user = userEvent.setup();
    api.fetchTeam
      .mockResolvedValueOnce([DANIEL_ROW, RAVI_ROW])             // first load
      .mockResolvedValueOnce([DANIEL_ROW, RAVI_ROW, AISHA_ROW])  // the add's reload, read before the remove
      .mockResolvedValue([DANIEL_ROW, AISHA_ROW]);               // after Ravi is taken off
    api.addTeammate.mockResolvedValue({ ok: true, member: AISHA_ROW });
    api.removeTeammate.mockResolvedValue({ ok: true });
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Ravi Kumar' });

    // The add's reload gets its team, then waits on Jira for the names.
    let answerNames;
    api.fetchDisplayNames.mockImplementationOnce(() => new Promise((resolve) => { answerNames = resolve; }));
    await user.type(screen.getByLabelText('Add a teammate'), 'Aisha');
    await user.click(await screen.findByRole('button', { name: 'Add Aisha Rahman to the team' }));
    await waitFor(() => expect(answerNames).toBeTypeOf('function'));

    // Daniel takes Ravi off while that reload is still waiting.
    await user.click(screen.getByRole('button', { name: 'Take Ravi Kumar off the team' }));
    await screen.findByText('Ravi Kumar is off the team. Their Jira tickets are unchanged.');

    // The late answer arrives. It was read before the remove, so it must not bring Ravi back.
    answerNames(NAMES);
    await screen.findByRole('button', { name: 'Catch up on Aisha Rahman' });
    expect(screen.queryByRole('button', { name: 'Catch up on Ravi Kumar' })).toBeNull();
  });

  it('takes Ravi off the team with a toast that Jira is unchanged (scenario 2)', async () => {
    const user = userEvent.setup();
    // The database forgets Ravi once he is taken off, so the page's reload agrees.
    api.fetchTeam.mockResolvedValueOnce([DANIEL_ROW, AISHA_ROW, RAVI_ROW]).mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.removeTeammate.mockResolvedValue({ ok: true });
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Ravi Kumar' });

    await user.click(screen.getByRole('button', { name: 'Take Ravi Kumar off the team' }));

    expect(api.removeTeammate).toHaveBeenCalledWith(RAVI);
    expect(await screen.findByText('Ravi Kumar is off the team. Their Jira tickets are unchanged.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Catch up on Ravi Kumar' })).toBeNull();
    expect(within(teamList()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks the open person and closes their catch-up when they are taken off', async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValueOnce([DANIEL_ROW, RAVI_ROW]).mockResolvedValue([DANIEL_ROW]);
    api.removeTeammate.mockResolvedValue({ ok: true });
    render(<TeamPage />);

    await user.click(await screen.findByRole('button', { name: 'Catch up on Ravi Kumar' }));
    const row = screen.getByRole('button', { name: 'Catch up on Ravi Kumar' }).closest('li');
    expect(row.className).toContain('is-selected');
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Ravi Kumar', level: 2 })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Take Ravi Kumar off the team' }));

    expect(await screen.findByText('Pick a teammate')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ravi Kumar', level: 2 })).toBeNull();
  });

  it('keeps the person on the list when taking them off fails', async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValue([RAVI_ROW]);
    api.removeTeammate.mockRejectedValue(new Error('network'));
    render(<TeamPage />);

    await user.click(await screen.findByRole('button', { name: 'Take Ravi Kumar off the team' }));

    expect(await screen.findByText("Couldn't take Ravi Kumar off the team. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Catch up on Ravi Kumar' })).toBeTruthy();
  });
});
