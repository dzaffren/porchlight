// The Team page: your porch light and the team list on the left, the picked teammate's
// catch-up on the right.
//
//   load:   listTeam + listStatuses → people (one Jira request: names, active, time zone) → list
//   add:    AddTeammate → addTeammate → reload the list → toast
//   remove: Remove → removeTeammate → row gone (and the catch-up closes if it was theirs) → toast → reload
//   reloads: only the newest read of the team may change the list
//   pick:   a row → CatchUp reads their work from Jira, as the viewer
//   porch:  MyPorchLight → setMyStatus → the lamp changes at once → toast → reload
//
// What each lamp shows is worked out on every render by effectiveStatus in @lib/porch.js,
// from the stored choice, the person's Jira time zone and Jira's `active` flag (D26).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveStatus, isKnownTimeZone } from '@lib/porch.js';
import * as api from './api.js';
import AddTeammate from './AddTeammate.jsx';
import CatchUp from './CatchUp.jsx';
import MyPorchLight from './MyPorchLight.jsx';
import { statusText } from './Presence.jsx';
import TeamList from './TeamList.jsx';
import Toast from './Toast.jsx';
import { Glyph } from './Glyph.jsx';

const unique = (values) => [...new Set(values)];

/**
 * The team, everyone's stored porch light, and what Jira says about each person. Jira's
 * part is looked up each time, never stored (decisions D12 and D27).
 *
 * A failed Jira lookup never hides the team: rows say "A teammate" and keep their stored
 * porch light. A failed porch light read does fail the whole read, because showing
 * everyone as Here would tell a teammate to message someone who is away.
 */
async function readTeam() {
  const [members, statuses] = await Promise.all([api.fetchTeam(), api.fetchStatuses()]);
  const accountIds = unique(members.flatMap((m) => [m.accountId, m.addedByAccountId]));
  let people = {};
  try {
    people = await api.fetchPeople(accountIds);
  } catch {
    // Names are a nicety; see nameOf below.
  }
  return { members, people, statuses: Object.fromEntries(statuses.map((row) => [row.accountId, row])) };
}

/** The browser's own time zone, for when Jira does not give the viewer's. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function TeamPage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [members, setMembers] = useState([]);
  const [people, setPeople] = useState({}); // accountId → { displayName, active, timeZone }
  const [statuses, setStatuses] = useState({}); // accountId → stored porch light; Here has none
  const [me, setMe] = useState(null); // the viewer: { accountId, displayName, timeZone }
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);

  const showTeam = useCallback((team) => {
    setMembers(team.members);
    // Keep what Jira said before about anyone it leaves out this time.
    setPeople((previous) => ({ ...previous, ...team.people }));
    setStatuses(team.statuses);
    setStatus('ready');
  }, []);

  // Who the viewer is, once: their own porch light card needs their account and time zone.
  // Without it there is no card, and the team list still works.
  useEffect(() => {
    let cancelled = false;
    api.fetchMyself().then((viewer) => { if (!cancelled) setMe(viewer); }, () => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Every read of the team takes a ticket number. Only the newest read may change the
  // list: an older read (for example an add's reload that started before a remove)
  // would otherwise put a removed person back when its answer arrives late.
  const newestRead = useRef(0);
  const reloadTeam = useCallback(async () => {
    const ticket = ++newestRead.current;
    const team = await readTeam();
    if (ticket === newestRead.current) showTeam(team);
  }, [showTeam]);

  useEffect(() => {
    // Ignore an answer that arrives after the page has gone away.
    let cancelled = false;
    const ticket = ++newestRead.current;
    readTeam().then(
      (team) => { if (!cancelled && ticket === newestRead.current) showTeam(team); },
      () => { if (!cancelled && ticket === newestRead.current) setStatus('error'); },
    );
    return () => {
      cancelled = true;
    };
  }, [showTeam]);

  const nameOf = useCallback((accountId) => people[accountId]?.displayName ?? 'A teammate', [people]);

  // The viewer's own zone decides "today" in the form, and stands in for anyone whose
  // zone Jira hides (open item O10).
  const viewerTimeZone = isKnownTimeZone(me?.timeZone) ? me.timeZone : browserTimeZone();

  // What one person's porch light shows right now. A person missing from Jira's answer
  // has no entry in `people`, so effectiveStatus keeps their stored status (risk O3).
  const statusOf = useCallback(
    (accountId) => effectiveStatus(statuses[accountId], people[accountId], new Date(), viewerTimeZone),
    [statuses, people, viewerTimeZone],
  );
  const memberIds = useMemo(() => new Set(members.map((m) => m.accountId)), [members]);
  const say = (text) => setToast({ id: crypto.randomUUID(), text });
  // One function for the page's whole life, so a re-render never restarts the toast's timer.
  const clearToast = useCallback(() => setToast(null), []);

  // Called by AddTeammate. Returns the resolver's answer so it can show "already on the
  // team"; a thrown error (the call failed) passes straight through to it.
  async function handleAdd(person) {
    const result = await api.addTeammate(person.accountId);
    if (result?.ok || result?.error === 'already_on_team') {
      // Reload rather than guess: someone else may have added people too, and the
      // reload brings who added each one.
      try {
        await reloadTeam();
      } catch {
        // The add worked; the list catches up on the next page load.
      }
    }
    if (result?.ok) {
      say(`${person.displayName} is on the team.`);
    }
    return result;
  }

  async function handleRemove(member) {
    const name = nameOf(member.accountId);
    try {
      const result = await api.removeTeammate(member.accountId);
      if (!result?.ok) throw new Error(result?.error ?? 'removeTeammate did not answer ok');
    } catch {
      say(`Couldn't take ${name} off the team. Try again.`);
      return;
    }
    setMembers((previous) => previous.filter((m) => m.accountId !== member.accountId));
    // If their catch-up was open, the pane goes back to "Pick a teammate".
    setSelectedId((current) => (current === member.accountId ? null : current));
    say(`${name} is off the team. Their Jira tickets are unchanged.`);
    // Read the team again, so this becomes the newest read and any older one is ignored.
    reloadTeam().catch(() => {
      // The row is already gone; the list catches up on the next page load.
    });
  }

  // Called by MyPorchLight with { kind, untilDate, timeZone }. Returns the resolver's
  // answer so the form can show a date error; a thrown error passes straight through.
  async function handleSaveStatus(choice) {
    const result = await api.setMyStatus(choice);
    if (!result?.ok) return result;

    // The lamp changes at once on the card, the row and the catch-up (motion tier 1).
    // Here has no stored row, so choosing it removes the viewer's row.
    setStatuses((previous) => {
      const next = { ...previous };
      if (choice.kind === 'here') delete next[me.accountId];
      else next[me.accountId] = { accountId: me.accountId, kind: choice.kind, untilDate: choice.untilDate };
      return next;
    });
    say(choice.kind === 'here' ? 'Your porch light is off.' : `Your porch light is on: ${statusText(choice)}.`);
    // Read again, so this becomes the newest read and teammates' changes show too.
    reloadTeam().catch(() => {
      // The lamp is already right; the list catches up on the next page load.
    });
    return result;
  }

  // The viewer's own porch light. When they are not on the team list, Jira's bulk answer
  // has no entry for them, so their time zone comes from /myself.
  const myStatus = me && effectiveStatus(
    statuses[me.accountId],
    people[me.accountId] ?? { timeZone: me.timeZone },
    new Date(),
    viewerTimeZone,
  );

  const selected = members.find((m) => m.accountId === selectedId) ?? null;
  const count = members.length;
  return (
    <>
      <main className="frame frame--wide">
        <header className="pl-page-header">
          <div>
            <h1 className="title"><Glyph name="lamp" lit size="md" />Porchlight</h1>
            <p>Catch up on a teammate&apos;s work. Porchlight reads it from Jira as you.</p>
          </div>
        </header>

        <div className="split">
          <div className="column">
            {/* Your porch light sits above the team list (decision D25). It waits for the
                stored statuses, so it never shows "Here" for someone who is away. */}
            {status === 'ready' && myStatus && (
              <MyPorchLight status={myStatus} timeZone={viewerTimeZone} onSave={handleSaveStatus} />
            )}
            <section className="team" aria-labelledby="team-title">
              <div className="sec-head">
                <h2 id="team-title">Team</h2>
                {status === 'ready' && count > 0 && (
                  <span className="pl-meta">{count} {count === 1 ? 'person' : 'people'}</span>
                )}
              </div>
              <AddTeammate memberIds={memberIds} onAdd={handleAdd} />
              {status === 'loading' && <span className="pl-meta" role="status">Loading the team…</span>}
              {status === 'error' && (
                <div className="pl-message pl-message--error" role="alert">
                  <Glyph name="gap" />
                  <p><strong>Couldn&apos;t load the team.</strong> Reload the page to try again.</p>
                </div>
              )}
              {status === 'ready' && (
                <TeamList
                  members={members}
                  nameOf={nameOf}
                  statusOf={statusOf}
                  selectedId={selectedId}
                  onPick={(member) => setSelectedId(member.accountId)}
                  onRemove={handleRemove}
                />
              )}
            </section>
          </div>

          {/* A new key per person gives each catch-up fresh state, so one person's
              tickets never show under another person's name. */}
          <CatchUp
            key={selected?.accountId ?? 'nobody'}
            person={selected && {
              accountId: selected.accountId,
              name: nameOf(selected.accountId),
              nameKnown: selected.accountId in people, // false → the row says "A teammate"
              status: statusOf(selected.accountId),
            }}
          />
        </div>
      </main>
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
