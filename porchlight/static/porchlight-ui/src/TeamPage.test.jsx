// Tests for the Team page: scenarios 1 and 2 in docs/specs/catch-up-view.md, and the porch
// lights in docs/specs/porch-status.md, page side.
// The Forge bridge only works inside Jira, so ./api.js is replaced with test doubles here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', () => ({
  fetchTeam: vi.fn(),
  addTeammate: vi.fn(),
  removeTeammate: vi.fn(),
  fetchPeople: vi.fn(),
  fetchMyself: vi.fn(),
  fetchStatuses: vi.fn(),
  setMyStatus: vi.fn(),
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

// Everyone on the made-up team works from Kuala Lumpur (UTC+8).
const KL = 'Asia/Kuala_Lumpur';

/** What Jira's user/bulk says about each known person: active, in Kuala Lumpur. */
const peopleFor = (ids) => Object.fromEntries(ids.filter((id) => NAMES[id])
  .map((id) => [id, { displayName: NAMES[id], active: true, timeZone: KL }]));

beforeEach(() => {
  vi.resetAllMocks();
  // Only Date is faked, so timers and user events run as normal.
  // Today is 7 November 2026: noon in Kuala Lumpur.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T04:00:00.000Z'));
  api.fetchPeople.mockImplementation(async (ids) => peopleFor(ids));
  api.fetchStatuses.mockResolvedValue([]);
  api.fetchMyself.mockResolvedValue({ accountId: DANIEL, displayName: 'Daniel Tan' });
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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    expect(api.fetchPeople).toHaveBeenCalledTimes(1);
    expect([...api.fetchPeople.mock.calls[0][0]].sort()).toEqual([AISHA, DANIEL, MEI_LING, RAVI].sort());
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
    api.fetchPeople.mockImplementationOnce(() => new Promise((resolve) => { answerNames = resolve; }));
    await user.type(screen.getByLabelText('Add a teammate'), 'Aisha');
    await user.click(await screen.findByRole('button', { name: 'Add Aisha Rahman to the team' }));
    await waitFor(() => expect(answerNames).toBeTypeOf('function'));

    // Daniel takes Ravi off while that reload is still waiting.
    await user.click(screen.getByRole('button', { name: 'Take Ravi Kumar off the team' }));
    await screen.findByText('Ravi Kumar is off the team. Their Jira tickets are unchanged.');

    // The late answer arrives. It was read before the remove, so it must not bring Ravi back.
    answerNames(peopleFor(Object.keys(NAMES)));
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

// ---------------------------------------------------------------------------------
// Porch lights: docs/specs/porch-status.md, scenarios 1 to 4, page side.
// ---------------------------------------------------------------------------------

const MEI_LING_ROW = member(MEI_LING, DANIEL, '2026-11-02T12:00:00.000Z');
const away = (accountId, untilDate) => ({ accountId, kind: 'away', untilDate });
const leaving = (accountId, untilDate) => ({ accountId, kind: 'leaving', untilDate });

/** Open the page as this person. */
function viewAs(accountId) {
  api.fetchMyself.mockResolvedValue({ accountId, displayName: NAMES[accountId] });
}

/** A team row, found by the person's name on its "Catch up on …" button. */
const rowOf = (name) => screen.getByRole('button', { name: `Catch up on ${name}` }).closest('li');
const myCard = () => screen.findByRole('region', { name: 'Your porch light' });

/** Change the viewer's own porch light through the card's form. */
async function setMyPorchLight(user, kind, date) {
  const card = await myCard();
  await user.click(within(card).getByRole('button', { name: 'Change' }));
  await user.selectOptions(within(card).getByRole('combobox', { name: 'Status' }), kind);
  if (date) {
    const input = within(card).getByLabelText('Date');
    await user.clear(input);
    await user.type(input, date);
  }
  await user.click(within(card).getByRole('button', { name: 'Save' }));
}

describe('TeamPage porch lights', () => {
  it('lets Aisha leave her porch light on, on her card, her row and her catch-up (scenario 1)', async () => {
    const user = userEvent.setup();
    viewAs(AISHA);
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    // Once she saves, the database has her row.
    api.fetchStatuses.mockResolvedValueOnce([]).mockResolvedValue([away(AISHA, '2026-11-20')]);
    api.setMyStatus.mockResolvedValue({ ok: true, status: away(AISHA, '2026-11-20') });
    render(<TeamPage />);
    expect(within(await myCard()).getByText('Here, porch light off')).toBeTruthy();

    await setMyPorchLight(user, 'away', '2026-11-20');

    expect(api.setMyStatus).toHaveBeenCalledWith({ kind: 'away', untilDate: '2026-11-20' });
    expect(await screen.findByText('Your porch light is on: Away until 20 Nov.')).toBeTruthy();
    expect((await myCard()).querySelector('.pl-presence--away').textContent).toBe('Away until 20 Nov');
    const row = rowOf('Aisha Rahman');
    expect(row.querySelector('.pl-presence--away').textContent).toBe('Away until 20 Nov');

    await user.click(screen.getByRole('button', { name: 'Catch up on Aisha Rahman' }));
    const pane = await screen.findByRole('region', { name: 'Aisha Rahman' });
    expect(pane.querySelector('.person .pl-presence--away').textContent).toBe('Away until 20 Nov');
  });

  it("shows Daniel Aisha's porch light, with no control to change it (scenario 1)", async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.fetchStatuses.mockResolvedValue([away(AISHA, '2026-11-20')]);
    render(<TeamPage />);

    // Screen readers hear the status as the row button's description.
    const aisha = await screen.findByRole('button', { name: 'Catch up on Aisha Rahman', description: 'Away until 20 Nov' });
    expect(rowOf('Aisha Rahman').querySelector('.pl-presence--away').textContent).toBe('Away until 20 Nov');
    await user.click(aisha);
    const pane = await screen.findByRole('region', { name: 'Aisha Rahman' });
    expect(within(pane).getByText('Away until 20 Nov')).toBeTruthy();

    // The only Change on the page is on Daniel's own card, which says he is here.
    const card = await myCard();
    expect(within(card).getByText('Here, porch light off')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Change' })).toEqual([within(card).getByRole('button', { name: 'Change' })]);
    expect(within(teamList()).queryByRole('combobox')).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it.each([
    ['2026-11-20T15:59:00.000Z', 'Away until 20 Nov'], // 23:59 on 20 Nov in Kuala Lumpur
    ['2026-11-20T16:00:00.000Z', null], //               00:00 on 21 Nov in Kuala Lumpur
  ])('at %s Aisha\'s row shows %j: Away ends by itself in her own day (scenario 2)', async (now, text) => {
    vi.setSystemTime(new Date(now));
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.fetchStatuses.mockResolvedValue([away(AISHA, '2026-11-20')]);
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Aisha Rahman' });

    expect(rowOf('Aisha Rahman').querySelector('.pl-presence')?.textContent ?? null).toBe(text);
  });

  it('turns the porch light off at once when Aisha sets Here (scenario 2)', async () => {
    const user = userEvent.setup();
    viewAs(AISHA);
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.fetchStatuses.mockResolvedValueOnce([away(AISHA, '2026-11-20')]).mockResolvedValue([]);
    api.setMyStatus.mockResolvedValue({ ok: true, status: null });
    render(<TeamPage />);
    expect((await myCard()).textContent).toContain('Away until 20 Nov');

    await setMyPorchLight(user, 'here');

    expect(api.setMyStatus).toHaveBeenCalledWith({ kind: 'here', untilDate: null });
    expect(await screen.findByText('Your porch light is off.')).toBeTruthy();
    expect(within(await myCard()).getByText('Here, porch light off')).toBeTruthy();
    expect(rowOf('Aisha Rahman').querySelector('.pl-presence')).toBeNull();
  });

  it('warns Ravi before he sets Leaving, and says so in the toast (scenario 3)', async () => {
    const user = userEvent.setup();
    viewAs(RAVI);
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, RAVI_ROW]);
    api.fetchStatuses.mockResolvedValueOnce([]).mockResolvedValue([leaving(RAVI, '2027-01-31')]);
    api.setMyStatus.mockResolvedValue({ ok: true, status: leaving(RAVI, '2027-01-31') });
    render(<TeamPage />);
    const card = await myCard();
    await user.click(within(card).getByRole('button', { name: 'Change' }));
    await user.selectOptions(within(card).getByRole('combobox', { name: 'Status' }), 'leaving');
    expect(within(card).getByText('Everyone on the team will see this.')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));

    await setMyPorchLight(user, 'leaving', '2027-01-31');

    expect(await screen.findByText('Your porch light is on: Leaving on 31 Jan.')).toBeTruthy();
    expect(rowOf('Ravi Kumar').querySelector('.pl-presence--away').textContent).toBe('Leaving on 31 Jan');
  });

  it.each([
    ['2026-11-10T04:00:00.000Z', 'Leaving on 31 Jan'],
    ['2027-01-31T15:59:00.000Z', 'Leaving on 31 Jan'], // 23:59 on 31 Jan in Ravi's day
    ['2027-01-31T16:00:00.000Z', 'Left'], //              00:00 on 1 Feb in Ravi's day
  ])('at %s Ravi\'s row shows "%s" with the lamp on (scenario 3)', async (now, text) => {
    vi.setSystemTime(new Date(now));
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, RAVI_ROW]);
    api.fetchStatuses.mockResolvedValue([leaving(RAVI, '2027-01-31')]);
    render(<TeamPage />);
    await screen.findByRole('button', { name: 'Catch up on Ravi Kumar' });

    expect(rowOf('Ravi Kumar').querySelector('.pl-presence--away').textContent).toBe(text);
  });

  it('gives Ravi no control once he has Left (scenario 3)', async () => {
    vi.setSystemTime(new Date('2027-02-01T04:00:00.000Z'));
    viewAs(RAVI);
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, RAVI_ROW]);
    api.fetchStatuses.mockResolvedValue([leaving(RAVI, '2027-01-31')]);
    render(<TeamPage />);

    const card = await myCard();
    await waitFor(() => expect(within(card).getByText('Left')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('shows Mei Ling as Left, lamp on, when Jira reports her account inactive (scenario 4)', async () => {
    const user = userEvent.setup();
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, MEI_LING_ROW]);
    api.fetchPeople.mockImplementation(async (ids) => ({
      ...peopleFor(ids),
      [MEI_LING]: { displayName: 'Mei Ling Goh', active: false, timeZone: KL },
    }));
    render(<TeamPage />);

    await screen.findByRole('button', { name: 'Catch up on Mei Ling Goh' });
    expect(rowOf('Mei Ling Goh').querySelector('.pl-presence--away').textContent).toBe('Left');
    await user.click(screen.getByRole('button', { name: 'Catch up on Mei Ling Goh' }));
    const pane = await screen.findByRole('region', { name: 'Mei Ling Goh' });
    expect(pane.querySelector('.person .pl-presence--away').textContent).toBe('Left');
  });

  it('keeps the last status of a person Jira leaves out, never a wrong "Left" (scenario 4)', async () => {
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, MEI_LING_ROW]);
    api.fetchStatuses.mockResolvedValue([away(MEI_LING, '2026-11-20')]);
    api.fetchPeople.mockImplementation(async (ids) => peopleFor(ids.filter((id) => id !== MEI_LING)));
    render(<TeamPage />);

    // Without Jira's answer the row has no name, but it keeps her stored Away.
    await screen.findByRole('button', { name: 'Catch up on A teammate' });
    expect(rowOf('A teammate').querySelector('.pl-presence--away').textContent).toBe('Away until 20 Nov');
  });

  it('shows nothing for a person Jira leaves out who has no stored status', async () => {
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, MEI_LING_ROW]);
    api.fetchPeople.mockImplementation(async (ids) => peopleFor(ids.filter((id) => id !== MEI_LING)));
    render(<TeamPage />);

    await screen.findByRole('button', { name: 'Catch up on A teammate' });
    expect(rowOf('A teammate').querySelector('.pl-presence')).toBeNull();
  });

  it('says the team cannot be loaded when the porch lights cannot be read', async () => {
    // Showing everyone as Here would tell Daniel to message someone who is away.
    api.fetchTeam.mockResolvedValue([DANIEL_ROW, AISHA_ROW]);
    api.fetchStatuses.mockRejectedValue(new Error('db down'));
    render(<TeamPage />);

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load the team. Reload the page to try again.");
  });

  it('has no porch light card when Jira cannot say who the viewer is', async () => {
    api.fetchTeam.mockResolvedValue([DANIEL_ROW]);
    api.fetchMyself.mockRejectedValue(new Error('403'));
    render(<TeamPage />);

    await screen.findByRole('button', { name: 'Catch up on Daniel Tan' });
    expect(screen.queryByRole('region', { name: 'Your porch light' })).toBeNull();
  });
});
