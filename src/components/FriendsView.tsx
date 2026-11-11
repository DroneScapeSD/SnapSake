'use client';
import { useState } from 'react';
import { serif } from '@/lib/fonts';
import type { Friends, Friendship } from '@/lib/friends';
import { field, label, panel, pillPrimary } from '@/lib/ui';
import { checkUsername, handle } from '@/lib/username';

const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Avatar({ username }: { username: string }) {
  return <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg/10 text-sm font-semibold uppercase">{username[0]}</span>;
}

function Row({ f, note, children }: { f: Friendship; note: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-fg/[0.04] px-4 py-3">
      <Avatar username={f.username} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{handle(f.username)}</p>
        <p className="text-xs text-fg/45">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

const small = 'rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50';
const smallPrimary = `${small} bg-fg text-bg hover:bg-fg/85`;
const smallGhost = `${small} border border-fg/15 text-fg hover:bg-fg/10`;
const smallDanger = `${small} text-red-500 hover:bg-red-500/10`;

export function FriendsView({ friends: fr, say }: { friends: Friends; say: (m: string) => void }) {
  const [picked, setTab] = useState<'friends' | 'requests' | null>(null);
  const [name, setName] = useState('');
  const [pending, setPending] = useState<string | null>(null); // id of the row being acted on

  const act = async (id: string, fn: () => Promise<string | null>, ok?: string) => {
    setPending(id);
    const err = await fn();
    setPending(null);
    say(err ?? ok ?? '');
  };

  async function add() {
    if (!name.trim()) return;
    const bad = checkUsername(name);
    if (bad) return say(bad);
    setPending('add');
    const err = await fr.send(name);
    setPending(null);
    if (err) return say(err);
    setName(''); say('Request sent'); setTab('requests');
  }

  const requestCount = fr.incoming.length + fr.outgoing.length;
  // Until you pick a tab yourself, open on Requests whenever someone has asked to be your friend.
  const tab = picked ?? (fr.incoming.length > 0 ? 'requests' : 'friends');

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
          Your <span className={`${serif.className} font-normal italic`}>friends</span>
        </h2>
        <p className="mt-3 text-sm text-fg/50">{fr.friends.length} {fr.friends.length === 1 ? 'friend' : 'friends'}</p>
      </div>

      <div className={`${panel} p-5`}>
        <p className={`${label} text-fg/50`}>Add a friend</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative w-full">
            <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-fg/40">@</span>
            <input className={`${field} !pl-9`} type="text" placeholder="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Friend's username"
              value={name} onChange={(e) => setName(e.target.value.replace(/^@/, ''))} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <button className={`${pillPrimary} shrink-0`} onClick={add} disabled={pending === 'add'}>Send request</button>
        </div>
        <p className="mt-2 text-xs text-fg/40">They need a SnapSake account with this username.</p>
      </div>

      <nav className="flex gap-8 border-b border-fg/10">
        {([['friends', 'Friends', fr.friends.length], ['requests', 'Requests', requestCount]] as const).map(([k, text, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`${label} -mb-px flex items-center gap-2 border-b-2 pb-3 transition ${tab === k ? 'border-fg text-fg' : 'border-transparent text-fg/45 hover:text-fg/80'}`}>
            {text}
            {k === 'requests' && fr.incoming.length > 0
              ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tracking-normal text-black">{fr.incoming.length}</span>
              : <span className="text-fg/35">{n}</span>}
          </button>
        ))}
      </nav>

      {!fr.loaded ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-fg/[0.06]" />)}</div>
      ) : tab === 'friends' ? (
        fr.friends.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-20 text-center">
            <p className={`${serif.className} text-4xl italic text-fg/80`}>No friends yet.</p>
            <p className="mt-3 text-sm text-fg/45">Send a request by username. Once they accept, they&apos;ll show up here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {fr.friends.map((f) => (
              <Row key={f.id} f={f} note={`Friends since ${since(f.created_at)}`}>
                <button className={smallDanger} disabled={pending === f.id}
                  onClick={() => confirm(`Remove ${handle(f.username)} from your friends?`) && act(f.id, () => fr.remove(f.id), 'Friend removed')}>Remove</button>
              </Row>
            ))}
          </ul>
        )
      ) : requestCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-20 text-center">
          <p className={`${serif.className} text-4xl italic text-fg/80`}>No pending requests.</p>
          <p className="mt-3 text-sm text-fg/45">Requests you send and receive will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {fr.incoming.length > 0 && (
            <section>
              <h3 className={`${label} mb-3 text-fg/50`}>Received</h3>
              <ul className="space-y-2">
                {fr.incoming.map((f) => (
                  <Row key={f.id} f={f} note={`Sent ${since(f.created_at)}`}>
                    <button className={smallPrimary} disabled={pending === f.id} onClick={() => act(f.id, () => fr.respond(f.id, true), 'Friend added')}>Accept</button>
                    <button className={smallGhost} disabled={pending === f.id} onClick={() => act(f.id, () => fr.respond(f.id, false))}>Decline</button>
                  </Row>
                ))}
              </ul>
            </section>
          )}
          {fr.outgoing.length > 0 && (
            <section>
              <h3 className={`${label} mb-3 text-fg/50`}>Sent</h3>
              <ul className="space-y-2">
                {fr.outgoing.map((f) => (
                  <Row key={f.id} f={f} note={`Waiting since ${since(f.created_at)}`}>
                    <button className={smallGhost} disabled={pending === f.id} onClick={() => act(f.id, () => fr.remove(f.id), 'Request cancelled')}>Cancel</button>
                  </Row>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
