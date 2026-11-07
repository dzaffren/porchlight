// The Team page: the team list on the left, the picked teammate's catch-up on the right.
//
//   load:   listTeam → names of members and of who added them (one Jira request) → list
//   add:    AddTeammate → addTeammate → reload the list → toast
//   remove: Remove → removeTeammate → row gone (and the catch-up closes if it was theirs) → toast
//   pick:   a row → CatchUp reads their work from Jira, as the viewer
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api.js';
import AddTeammate from './AddTeammate.jsx';
import CatchUp from './CatchUp.jsx';
import TeamList from './TeamList.jsx';
import Toast from './Toast.jsx';
import { Glyph } from './Glyph.jsx';

const unique = (values) => [...new Set(values)];

/**
 * The team and every name it shows. Names are looked up each time, never stored
 * (decision D12). A failed name lookup never hides the team: rows say "A teammate".
 */
async function readTeam() {
  const members = await api.fetchTeam();
  const accountIds = unique(members.flatMap((m) => [m.accountId, m.addedByAccountId]));
  let names = {};
  try {
    names = await api.fetchDisplayNames(accountIds);
  } catch {
    // Names are a nicety; see nameOf below.
  }
  return { members, names };
}

export default function TeamPage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [members, setMembers] = useState([]);
  const [names, setNames] = useState({}); // accountId → display name
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);

  const showTeam = useCallback((team) => {
    setMembers(team.members);
    setNames((previous) => ({ ...previous, ...team.names }));
    setStatus('ready');
  }, []);

  useEffect(() => {
    // Ignore an answer that arrives after the page has gone away.
    let cancelled = false;
    readTeam().then(
      (team) => { if (!cancelled) showTeam(team); },
      () => { if (!cancelled) setStatus('error'); },
    );
    return () => {
      cancelled = true;
    };
  }, [showTeam]);

  const nameOf = useCallback((accountId) => names[accountId] ?? 'A teammate', [names]);
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
        showTeam(await readTeam());
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
  }

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
                selectedId={selectedId}
                onPick={(member) => setSelectedId(member.accountId)}
                onRemove={handleRemove}
              />
            )}
          </section>

          {/* A new key per person gives each catch-up fresh state, so one person's
              tickets never show under another person's name. */}
          <CatchUp
            key={selected?.accountId ?? 'nobody'}
            person={selected && {
              accountId: selected.accountId,
              name: nameOf(selected.accountId),
              nameKnown: selected.accountId in names, // false → the row says "A teammate"
            }}
          />
        </div>
      </main>
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
