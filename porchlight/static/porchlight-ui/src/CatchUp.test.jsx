// Tests for the catch-up pane: scenarios 3, 4 and 5 in docs/specs/catch-up-view.md.
// ./api.js is replaced with test doubles; the real rules in catchup.js run on its answers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api.js', () => ({
  findFlaggedFieldId: vi.fn(),
  searchOpenWork: vi.fn(),
  countOpenWork: vi.fn(),
  searchRecentActivity: vi.fn(),
  openWorkJql: vi.fn(),
  openInJira: vi.fn(),
  getSiteUrl: vi.fn(),
}));

import * as api from './api.js';
import CatchUp from './CatchUp.jsx';

const AISHA = '712020:aisha-rahman';
const RAVI = '712020:ravi-kumar';
const FLAGGED = 'customfield_10021';
const aisha = { accountId: AISHA, name: 'Aisha Rahman' };
const ravi = { accountId: RAVI, name: 'Ravi Kumar' };

const TODO = { key: 'new' };
const IN_PROGRESS = { key: 'indeterminate' };

const issue = (key, summary, statusName, category, extra = {}) => ({
  key,
  fields: { summary, status: { name: statusName, statusCategory: category }, updated: '2026-11-06T12:00:00.000+0000', issuelinks: [], ...extra },
});

// Some of Aisha's open tickets on 10 November 2026 (the full rules are in catchup.test.js).
const AISHA_OPEN = [
  issue('PAY-142', 'Retry failed bank transfers', 'In Progress', IN_PROGRESS),
  issue('PAY-147', 'Show transfer status to customers', 'In Progress', IN_PROGRESS, {
    issuelinks: [{
      type: { inward: 'is blocked by' },
      inwardIssue: { key: 'OPS-31', fields: { summary: 'Bank API sandbox access', status: { statusCategory: IN_PROGRESS } } },
    }],
  }),
  issue('PAY-160', 'Refund file for the finance team', 'To Do', TODO, { [FLAGGED]: [{ value: 'Impediment' }] }),
  issue('PAY-151', 'Year-end batch job', 'To Do', TODO, { duedate: '2026-12-20' }),
];
const AISHA_RECENT = [{
  key: 'PAY-142',
  fields: { summary: 'Retry failed bank transfers', comment: { comments: [], total: 0 } },
  changelog: {
    total: 1,
    histories: [{ id: '1', author: { accountId: AISHA }, created: '2026-11-06T12:00:00.000+0000', items: [{ field: 'status', toString: 'In Progress' }] }],
  },
}];

const section = (name) => screen.getByRole('region', { name });

beforeEach(() => {
  vi.resetAllMocks();
  // Only Date is faked, so timers and user events run as normal. Today is 10 November 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T09:00:00.000Z'));
  document.documentElement.dataset.motion = 'full';
  api.findFlaggedFieldId.mockResolvedValue(FLAGGED);
  api.searchOpenWork.mockResolvedValue({ issues: AISHA_OPEN, isLast: true });
  api.searchRecentActivity.mockResolvedValue(AISHA_RECENT);
  api.getSiteUrl.mockResolvedValue('https://handover-demo.atlassian.net');
  api.openWorkJql.mockImplementation((id) => `assignee = "${id}" AND statusCategory != Done ORDER BY updated DESC`);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CatchUp', () => {
  it('asks to pick a teammate when nobody is picked', () => {
    render(<CatchUp person={null} />);

    expect(screen.getByText('Pick a teammate')).toBeTruthy();
    expect(screen.getByText('See their open work, latest changes, blockers and next steps, straight from Jira.')).toBeTruthy();
    expect(api.searchOpenWork).not.toHaveBeenCalled();
  });

  it('shows skeleton rows in the four sections while Jira answers', () => {
    api.searchOpenWork.mockReturnValue(new Promise(() => {}));
    render(<CatchUp person={aisha} />);

    expect(screen.getByText('Loading from Jira…')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['Open work', 'Latest changes', 'Blockers', 'Next steps']);
  });

  it("shows Aisha's open work, latest changes, blockers and next steps (scenario 3)", async () => {
    render(<CatchUp person={aisha} />);

    expect(screen.getByRole('heading', { name: 'Aisha Rahman', level: 2 })).toBeTruthy();
    expect(screen.getByText('From Jira, as you · 10 Nov 2026 · Showing only tickets you can open.')).toBeTruthy();

    const open = await screen.findByRole('region', { name: 'Open work' });
    const first = within(open).getAllByRole('listitem')[0];
    expect(within(first).getByRole('link').textContent).toBe('PAY-142');
    expect(first.textContent).toContain('Retry failed bank transfers');
    expect(within(first).getByText('In Progress').className).toBe('pl-lozenge pl-lozenge--progress');
    expect(within(first).getByText('6 Nov')).toBeTruthy();
    expect(within(open).getByText('4')).toBeTruthy();

    const change = within(section('Latest changes')).getAllByRole('listitem')[0];
    expect(change.textContent).toContain('PAY-142');
    expect(change.textContent).toContain('Moved to In Progress');
    expect(change.textContent).toContain('6 Nov');

    const blockers = within(section('Blockers')).getAllByRole('listitem');
    const chip = within(blockers[0]).getByRole('link', { name: 'Blocked by OPS-31' });
    expect(chip.className).toBe('pl-chip');
    expect(chip.getAttribute('title')).toBe('Bank API sandbox access');
    expect(within(blockers[1]).getByText('Flagged').className).toBe('pl-lozenge pl-lozenge--blocked');

    const next = within(section('Next steps')).getAllByRole('listitem');
    expect(next[0].textContent).toContain('PAY-151');
    expect(next[0].textContent).toContain('Due 20 Dec');
    expect(next[1].textContent).toContain('No due date');

    // The search is for the picked person, not the viewer, with the site's Flagged field.
    expect(api.searchOpenWork).toHaveBeenCalledWith(AISHA, FLAGGED);
    expect(api.searchRecentActivity).toHaveBeenCalledWith(AISHA);
    expect(api.countOpenWork).not.toHaveBeenCalled();
  });

  it('opens each ticket in Jira from its key', async () => {
    const user = userEvent.setup();
    render(<CatchUp person={aisha} />);

    const key = within(await screen.findByRole('region', { name: 'Open work' })).getByRole('link', { name: 'PAY-142' });
    // The full address, so a middle-click or "Open link in new tab" lands on the ticket in Jira,
    // not on the app frame's own host. A plain click still goes through Forge's router.
    await waitFor(() => expect(key.getAttribute('href')).toBe('https://handover-demo.atlassian.net/browse/PAY-142'));
    await user.click(key);
    expect(api.openInJira).toHaveBeenCalledWith('/browse/PAY-142');

    await user.click(within(section('Blockers')).getByRole('link', { name: 'Blocked by OPS-31' }));
    expect(api.openInJira).toHaveBeenCalledWith('/browse/OPS-31');
  });

  it('shows the first 50 of 63 open tickets and links to the other 13 in Jira', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 63 }, (_, i) => issue(`PAY-${300 - i}`, `Ticket ${i}`, 'To Do', TODO));
    api.searchOpenWork.mockResolvedValue({ issues: many, isLast: false });
    api.countOpenWork.mockResolvedValue(63);
    render(<CatchUp person={aisha} />);

    const open = await screen.findByRole('region', { name: 'Open work' });
    const more = within(open).getByRole('link', { name: 'and 13 more in Jira' });
    expect(within(open).getAllByRole('listitem')).toHaveLength(51);
    expect(within(open).getByText('63')).toBeTruthy();
    expect(api.countOpenWork).toHaveBeenCalledWith(AISHA);

    await user.click(more);
    expect(api.openInJira).toHaveBeenCalledWith(
      `/issues/?jql=${encodeURIComponent(`assignee = "${AISHA}" AND statusCategory != Done ORDER BY updated DESC`)}`,
    );
  });

  it('says so in every section when there is nothing in Jira (scenario 4)', async () => {
    api.findFlaggedFieldId.mockResolvedValue(null);
    api.searchOpenWork.mockResolvedValue({ issues: [], isLast: true });
    api.searchRecentActivity.mockResolvedValue([]);
    render(<CatchUp person={ravi} />);

    expect(await screen.findByText('No open work.')).toBeTruthy();
    expect(screen.getByText('No changes in the last 14 days.')).toBeTruthy();
    expect(screen.getByText('No blockers.')).toBeTruthy();
    expect(screen.getByText('No next steps.')).toBeTruthy();
  });

  it.each([
    ['the open-work search', () => api.searchOpenWork.mockRejectedValueOnce(new Error('timeout'))],
    ['the activity search', () => api.searchRecentActivity.mockRejectedValueOnce(new Error('timeout'))],
    ['the Flagged field', () => api.findFlaggedFieldId.mockRejectedValueOnce(new Error('timeout'))],
    ['the count', () => {
      api.searchOpenWork.mockResolvedValue({ issues: AISHA_OPEN, isLast: false });
      api.countOpenWork.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(4);
    }],
  ])('shows an error when %s fails, and Try again loads the catch-up (scenario 5)', async (_, fail) => {
    const user = userEvent.setup();
    fail();
    render(<CatchUp person={aisha} />);

    const alert = await screen.findByRole('alert');
    expect(alert.querySelector('strong').textContent).toBe("Couldn't load Aisha's work from Jira.");
    expect(alert.textContent).toContain("Couldn't load Aisha's work from Jira. Try again.");
    expect(alert.className).toBe('pl-message pl-message--error');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'Open work' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('PAY-142').length).toBeGreaterThan(0);
  });

  it("ignores a late answer for someone who is no longer picked", async () => {
    let finishAisha;
    api.searchOpenWork.mockImplementation((id) => (id === AISHA
      ? new Promise((resolve) => { finishAisha = resolve; })
      : Promise.resolve({ issues: [], isLast: true })));
    api.searchRecentActivity.mockResolvedValue([]);
    const { rerender } = render(<CatchUp key={AISHA} person={aisha} />);
    await vi.waitFor(() => expect(finishAisha).toBeTypeOf('function'));

    rerender(<CatchUp key={RAVI} person={ravi} />);
    expect(await screen.findByText('No open work.')).toBeTruthy();
    finishAisha({ issues: AISHA_OPEN, isLast: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByRole('heading', { name: 'Ravi Kumar', level: 2 })).toBeTruthy();
    expect(screen.queryByText('PAY-142')).toBeNull();
  });

  it('lets rows rise in, unless the viewer chose reduced motion', async () => {
    const { unmount } = render(<CatchUp person={aisha} />);
    const open = await screen.findByRole('region', { name: 'Open work' });
    expect(within(open).getByRole('list').className).toBe('pl-list pl-list--stagger');
    unmount();

    document.documentElement.dataset.motion = 'reduced';
    render(<CatchUp person={aisha} />);
    const still = await screen.findByRole('region', { name: 'Open work' });
    expect(within(still).getByRole('list').className).toBe('pl-list');
  });

  it("says this teammate's work when their name could not be looked up", async () => {
    // TeamPage shows "A teammate" when Jira's name lookup fails; the error must not say "A's work".
    api.searchOpenWork.mockRejectedValue(new Error('Jira did not answer'));
    render(<CatchUp person={{ accountId: AISHA, name: 'A teammate', nameKnown: false }} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load this teammate's work from Jira.");
  });

  it('shows ticket text as text, never as HTML', async () => {
    api.searchOpenWork.mockResolvedValue({
      issues: [issue('PAY-9', '<img src=x onerror="alert(1)">', 'To Do', TODO)],
      isLast: true,
    });
    const { container } = render(<CatchUp person={aisha} />);

    expect((await screen.findAllByText('<img src=x onerror="alert(1)">')).length).toBeGreaterThan(0);
    expect(container.querySelector('img')).toBeNull();
  });
});
