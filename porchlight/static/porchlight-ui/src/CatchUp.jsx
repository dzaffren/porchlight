// The catch-up pane: one teammate's work, read from Jira as the viewer (decision D21).
//
//   pick ─┬─ Flagged field → open-work search → (count, only if there is more than one page)
//         └─ activity search (last 14 days, with history and comments)
//         → catchup.js → Open work · Latest changes · Blockers · Next steps
//   any request fails → "Couldn't load Aisha's work from Jira." + Try again
//
// Jira only returns tickets the viewer can open, so the pane says so in its header.
//
// Security: summaries, comments and names are typed by people in Jira. They are React
// text children, so they show as text (like textContent), never as HTML.
import { createContext, useContext, useEffect, useId, useState } from 'react';
import * as api from './api.js';
import { toBlockers, toChanges, toNextSteps, toOpenWork } from './catchup.js';
import { formatDay, formatDue, formatFullDate, initials } from './format.js';
import { Glyph } from './Glyph.jsx';
import Presence from './Presence.jsx';

const SECTION_TITLES = ['Open work', 'Latest changes', 'Blockers', 'Next steps'];

// Jira's status category → the design system's lozenge for a real ticket status.
const LOZENGE = {
  new: 'pl-lozenge--todo',
  indeterminate: 'pl-lozenge--progress',
  done: 'pl-lozenge--done',
};

/**
 * Read everything one catch-up needs from Jira and sort it into the four sections.
 * Rejects if any request fails, so the pane shows one error, never half a catch-up.
 */
async function loadCatchUp(accountId) {
  const openWork = api.findFlaggedFieldId().then(async (flaggedFieldId) => {
    const search = await api.searchOpenWork(accountId, flaggedFieldId);
    // search/jql gives no total, so count only when there is more than one page.
    const total = search.isLast ? search.issues.length : await api.countOpenWork(accountId);
    return { issues: search.issues, total, flaggedFieldId };
  });
  const [open, recent] = await Promise.all([openWork, api.searchRecentActivity(accountId)]);
  return {
    openWork: toOpenWork(open.issues, open.total),
    changes: toChanges(recent, accountId, new Date()),
    blockers: toBlockers(open.issues, open.flaggedFieldId),
    nextSteps: toNextSteps(open.issues),
  };
}

/** Rows rise in, 40ms apart. Reduced motion is handled by the design system's CSS. */
const LIST_CLASS = 'pl-list pl-list--stagger';

/**
 * A link to a page in Jira, such as "/browse/PAY-142". The page runs in a sandboxed
 * frame, so the click goes through Forge's router instead of the browser. The href is
 * kept so the link still reads as a link, and shows where it goes.
 */
function JiraLink({ path, className, title, children }) {
  const siteUrl = useContext(SiteUrl);
  function handleClick(event) {
    event.preventDefault();
    api.openInJira(path);
  }
  // The full address once Forge has told us the site; a middle-click then opens Jira.
  return (
    <a className={className} href={`${siteUrl}${path}`} title={title} onClick={handleClick}>{children}</a>
  );
}

/** The Jira site's address for every link in the pane; empty until Forge answers. */
const SiteUrl = createContext('');

/**
 * One ticket line: icon, key (opens the ticket), text, real Jira status, and an end
 * piece (a date, a due date, or what blocks it).
 */
function TicketRow({ ticketKey, text, statusName, statusCategory, end }) {
  return (
    <li className="pl-row">
      <Glyph name="ticket" />
      <JiraLink className="pl-key" path={`/browse/${ticketKey}`} title={`Open ${ticketKey} in Jira`}>{ticketKey}</JiraLink>
      <span className="pl-row__summary">{text}</span>
      {statusName
        ? <span className={`pl-lozenge ${LOZENGE[statusCategory] ?? LOZENGE.new}`}>{statusName}</span>
        : <span />}
      {end}
    </li>
  );
}

/** One of the four sections: a heading with its count, then the rows or an empty line. */
function Section({ title, count, emptyText, rows, footer = null }) {
  const headingId = useId();
  return (
    <section className="stack" aria-labelledby={headingId}>
      <div className="sec-head">
        <h3 id={headingId}>{title}</h3>
        {rows.length > 0 && <span className="pl-meta">{count}</span>}
      </div>
      <ul className={LIST_CLASS}>
        {rows.length > 0 ? rows : <li className="pl-row empty-row"><span>{emptyText}</span></li>}
        {footer}
      </ul>
    </section>
  );
}

/** The four sections, filled. */
function Sections({ accountId, work }) {
  const { openWork, changes, blockers, nextSteps } = work;
  const total = openWork.rows.length + openWork.more;
  const moreLink = openWork.more > 0 && (
    <li className="pl-row empty-row">
      <JiraLink className="more" path={`/issues/?jql=${encodeURIComponent(api.openWorkJql(accountId))}`}>
        {`and ${openWork.more} more in Jira`}
      </JiraLink>
    </li>
  );

  return (
    <>
      <Section
        title="Open work"
        count={total}
        emptyText="No open work."
        footer={moreLink}
        rows={openWork.rows.map((t) => (
          <TicketRow key={t.key} ticketKey={t.key} text={t.summary} statusName={t.statusName} statusCategory={t.statusCategory}
            end={<span className="pl-meta">{formatDay(t.updated)}</span>} />
        ))}
      />
      <Section
        title="Latest changes"
        count={changes.length}
        emptyText="No changes in the last 14 days."
        rows={changes.map((c) => (
          <TicketRow key={c.id} ticketKey={c.key} text={c.text} end={<span className="pl-meta">{formatDay(c.created)}</span>} />
        ))}
      />
      <Section
        title="Blockers"
        count={blockers.length}
        emptyText="No blockers."
        rows={blockers.map((b) => (
          <TicketRow key={b.key} ticketKey={b.key} text={b.summary} statusName={b.statusName} statusCategory={b.statusCategory}
            end={b.blockedBy ? (
              <JiraLink className="pl-chip" path={`/browse/${b.blockedBy.key}`} title={b.blockedBy.summary}>
                <Glyph name="ticket" />{`Blocked by ${b.blockedBy.key}`}
              </JiraLink>
            ) : (
              <span className="pl-lozenge pl-lozenge--blocked">Flagged</span>
            )} />
        ))}
      />
      <Section
        title="Next steps"
        count={nextSteps.length}
        emptyText="No next steps."
        rows={nextSteps.map((t) => (
          <TicketRow key={t.key} ticketKey={t.key} text={t.summary} statusName={t.statusName} statusCategory={t.statusCategory}
            end={<span className="pl-meta">{formatDue(t.due)}</span>} />
        ))}
      />
    </>
  );
}

/** Placeholder rows in the four sections while Jira answers. */
function Loading() {
  return (
    <>
      {SECTION_TITLES.map((title) => (
        <section className="stack" key={title}>
          <div className="sec-head"><h3>{title}</h3></div>
          <ul className="pl-list" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <li className="pl-row sk-row" key={n}>
                <span className="pl-skeleton sk-key" />
                <span className="pl-skeleton" />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <span className="pl-meta" role="status">Loading from Jira…</span>
    </>
  );
}

/** Nobody picked yet. */
function PickSomeone({ titleId }) {
  return (
    <div className="pl-empty">
      <p className="pl-empty__title" id={titleId}>Pick a teammate</p>
      <p>See their open work, latest changes, blockers and next steps, straight from Jira.</p>
    </div>
  );
}

/**
 * The picked person: avatar, name, their porch light, and where the facts come from.
 * The porch light is read only here; only the person changes it, on their own card.
 */
function PersonHeader({ name, status, titleId }) {
  return (
    <div className="person">
      <span className="pl-avatar pl-avatar--lg" aria-hidden="true">{initials(name)}</span>
      <div className="person-text">
        <h2 id={titleId}>{name}</h2>
        {status && <Presence status={status} />}
        <span className="pl-meta">From Jira, as you · {formatFullDate(new Date())} · Showing only tickets you can open.</span>
      </div>
    </div>
  );
}

/**
 * @param {{ person: { accountId: string, name: string, nameKnown?: boolean, status?: object } | null }} props
 *   TeamPage gives each person their own key, so this component starts fresh for each.
 *   status: what their porch light shows right now, from effectiveStatus in @lib/porch.js.
 */
export default function CatchUp({ person }) {
  const titleId = useId();
  const [state, setState] = useState({ status: 'loading' }); // loading | ready (+ work) | error
  const [attempt, setAttempt] = useState(0); // goes up on each Try again, to load again
  const accountId = person?.accountId;

  // The site's address, for full link hrefs. A failure keeps relative links, which a
  // plain click still opens through Forge's router.
  const [siteUrl, setSiteUrl] = useState('');
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    api.getSiteUrl().then((url) => { if (!cancelled) setSiteUrl(url); }, () => {});
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return undefined;
    // Ignore an answer for a person who is no longer picked, or for an older attempt.
    let current = true;
    loadCatchUp(accountId).then(
      (work) => { if (current) setState({ status: 'ready', work }); },
      () => { if (current) setState({ status: 'error' }); },
    );
    return () => {
      current = false;
    };
  }, [accountId, attempt]);

  function tryAgain() {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (!person) {
    return (
      <section className="pane" aria-live="polite" aria-labelledby={titleId}>
        <PickSomeone titleId={titleId} />
      </section>
    );
  }

  // "Aisha's work", or "this teammate's work" when Jira's name lookup failed and the
  // row only says "A teammate" (its first word would read "A's work").
  const whose = person.nameKnown === false ? "this teammate's" : `${person.name.split(' ')[0]}'s`;
  return (
    <section className="pane" aria-live="polite" aria-labelledby={titleId}>
      <PersonHeader name={person.name} status={person.status} titleId={titleId} />
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && (
        <div className="pl-message pl-message--error" role="alert">
          <Glyph name="gap" />
          <p><strong>Couldn&apos;t load {whose} work from Jira.</strong> Try again.</p>
          <button className="pl-btn pl-btn--secondary" type="button" onClick={tryAgain}>Try again</button>
        </div>
      )}
      {state.status === 'ready' && (
        <SiteUrl.Provider value={siteUrl}>
          <Sections accountId={person.accountId} work={state.work} />
        </SiteUrl.Provider>
      )}
    </section>
  );
}
