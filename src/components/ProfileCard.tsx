'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { serif } from '@/lib/fonts';
import { TIERS, tierOf, type Tier } from '@/lib/limits';
import { label } from '@/lib/ui';
import { handle } from '@/lib/username';

type Profile = {
  username: string; tier: string; joined: string; photo_count: number; friend_count: number;
  relationship: 'self' | 'friends' | 'pending_in' | 'pending_out' | 'none'; mutual: string[];
};

const BADGE: Record<Tier, string> = { free: 'Free', plus: '✦ Plus', pro: '💎 Pro', admin: '👑 Admin' };
const RELATION: Record<Profile['relationship'], string> = {
  self: 'This is you', friends: 'Friends', pending_in: 'Wants to be your friend', pending_out: 'Friend request sent', none: '',
};

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-fg/[0.04] p-4">
      <p className={`${label} text-fg/50`}>{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg/45">{sub}</p>}
    </div>
  );
}

// A profile page body. Used on the Account page (your own) and in the popup opened from the Friends list.
export function ProfileCard({ username, refreshKey, onOpenProfile }: { username: string; refreshKey?: unknown; onOpenProfile?: (u: string) => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    supabase.rpc('profile_summary', { p_username: username }).then(({ data, error }) => {
      if (!live) return;
      if (error || !data) setError(/not found/i.test(error?.message ?? '') ? 'User not found' : 'Profiles need one more setup step: run supabase/profile_pages.sql in the Supabase SQL Editor, then reload.');
      else setP(data as Profile);
    });
    return () => { live = false; };
  }, [username, refreshKey]);

  if (error) return <p className="rounded-2xl border border-fg/10 p-6 text-sm text-fg/60">{error}</p>;
  if (!p || p.username !== username) return <div className="h-72 animate-pulse rounded-[1.75rem] bg-fg/[0.06]" />;

  const tier = tierOf(p.tier);
  const joined = new Date(p.joined);
  const days = Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86_400_000));
  const age = days < 31 ? `${days} day${days === 1 ? '' : 's'}` : days < 365 ? `${Math.floor(days / 30)} months` : `${(days / 365).toFixed(1).replace(/\.0$/, '')} years`;

  return (
    <div className={`pf-frame tier-${tier}`}>
      <div className="pf-inner p-6 sm:p-8">
        <div className="relative flex flex-wrap items-center gap-5">
          <span aria-hidden className="pf-avatar h-20 w-20 shrink-0 text-3xl">{p.username[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className={`${serif.className} truncate text-4xl italic`}>{handle(p.username)}</h3>
              <span className={`pf-badge tier-${tier}`}>{BADGE[tier]}</span>
            </div>
            <p className="mt-1.5 text-sm text-fg/50">{TIERS[tier].name} plan{RELATION[p.relationship] && ` · ${RELATION[p.relationship]}`}</p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat title="Joined" value={joined.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} sub={`${age} ago`} />
          <Stat title="Photos" value={String(p.photo_count)} sub="Uploaded" />
          <Stat title="Friends" value={String(p.friend_count)} />
          {p.relationship === 'self'
            ? <Stat title="Plan" value={TIERS[tier].name} />
            : <Stat title="Mutual" value={String(p.mutual.length)} sub={p.mutual.length === 1 ? 'friend' : 'friends'} />}
        </div>

        {p.relationship !== 'self' && p.mutual.length > 0 && (
          <div className="relative mt-5">
            <p className={`${label} text-fg/50`}>Mutual friends</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.mutual.map((m) => (
                <button key={m} onClick={() => onOpenProfile?.(m)} disabled={!onOpenProfile}
                  className="flex items-center gap-2 rounded-full bg-fg/[0.06] py-1 pl-1 pr-3 text-sm transition enabled:hover:bg-fg/10">
                  <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-fg/10 text-xs font-semibold uppercase">{m[0]}</span>
                  {handle(m)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The same card in a popup, so a name in the Friends list can be opened. Click a mutual friend to jump to their profile.
export function ProfileModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [stack, setStack] = useState<string[]>([username]);
  const current = stack[stack.length - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-auto w-full max-w-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Profile of ${handle(current)}`}>
        <div className="mb-3 flex items-center justify-between">
          {stack.length > 1
            ? <button className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white transition hover:bg-white/20" onClick={() => setStack((s) => s.slice(0, -1))}>← Back</button>
            : <span />}
          <button className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white transition hover:bg-white/20" onClick={onClose}>Close</button>
        </div>
        <ProfileCard username={current} onOpenProfile={(u) => setStack((s) => [...s, u])} />
      </div>
    </div>
  );
}
