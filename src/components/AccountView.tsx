'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { serif } from '@/lib/fonts';
import { INVITES, TIERS, TIER_KEYS, rank, tierOf, type Tier } from '@/lib/limits';
import { field, label, limitLabel, panel, pillGhost, pillPrimary, size } from '@/lib/ui';
import { handle } from '@/lib/username';
import { ProfileCard } from '@/components/ProfileCard';

// What each plan includes, as shown on the cards. The numbers come from TIERS in lib/limits.ts.
const perks = (t: Tier, storage?: number) => [
  `${limitLabel(storage ?? TIERS[t].quota)} of storage`,
  `${TIERS[t].resolution} photo quality`,
  `Share each photo or album with up to ${TIERS[t].shares} people`,
];

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="text-sm text-fg/50">{title}</p>
      <div className="min-w-0 text-sm font-medium">{children}</div>
    </div>
  );
}

export function AccountView({ user, username, tier, quota, used, friendCount, say, onLogout, onTierChange }: {
  user: User; username: string; tier: string; quota: number; used: number; friendCount: number; say: (m: string) => void; onLogout: () => void; onTierChange: () => void;
}) {
  const [invited, setInvited] = useState<number | null>(null); // friends who joined via your link and uploaded a photo
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const current = tierOf(tier);
  const plan = TIERS[current];
  const joined = new Date(user.created_at);

  // Counts qualifying invites (and upgrades the plan on the server if a target was reached).
  useEffect(() => {
    supabase.rpc('redeem_invites').then(({ data, error }) => {
      if (error || !data) return setInvited(0); // invites.sql not run yet
      setInvited(data.count ?? 0);
      if (tierOf(data.tier) !== tierOf(tier)) { onTierChange(); say(`You unlocked the ${TIERS[tierOf(data.tier)].name} plan!`); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, used]);

  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(location.origin), []);
  const inviteUrl = username && origin ? `${origin}/?ref=${username}` : '';

  async function copyInvite() {
    const url = `${location.origin}/?ref=${username}`;
    try { await navigator.clipboard.writeText(url); say('Invite link copied'); } catch { say(url); }
  }

  async function changePassword() {
    if (pw.length < 6) return say('Password must be at least 6 characters');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return say(error.message);
    setPw(''); say('Password updated');
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
          Your <span className={`${serif.className} font-normal italic`}>account</span>
        </h2>
        <p className="mt-3 truncate text-sm text-fg/50">{username && handle(username)}</p>
      </div>

      {username && <ProfileCard username={username} refreshKey={`${used}-${friendCount}-${tier}`} />}

      <section className={`${panel} p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`${label} text-fg/50`}>Subscription</p>
            <p className={`${serif.className} mt-2 text-4xl italic`}>{plan.name}</p>
          </div>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-text">Current plan</span>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-fg/65">
          {perks(current, quota).map((p) => <li key={p}>{p}</li>)}
        </ul>
        <div className="mt-6">
          <div className="flex justify-between text-xs text-fg/50"><span>Storage used</span><span>{size(used)} of {limitLabel(quota)}</span></div>
          <div className="mt-1.5 h-[3px] rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent" style={{ width: `${quota > 0 ? Math.min(100, (used / quota) * 100) : 100}%` }} /></div>
        </div>
      </section>

      <section>
        <h3 className={`${label} mb-3 text-fg/50`}>Plans</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {TIER_KEYS.filter((t) => t !== 'admin').map((t) => {
            const isCurrent = t === current;
            const need = t === 'plus' ? INVITES.plus : INVITES.pro;
            const done = invited === null ? 0 : Math.min(invited, need);
            return (
              <div key={t} className={`${panel} flex flex-col p-5 ${isCurrent ? 'ring-1 ring-accent/60' : ''}`}>
                <p className={`${serif.className} text-3xl italic`}>{TIERS[t].name}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-fg/65">
                  {perks(t).map((p) => <li key={p}>{p}</li>)}
                </ul>
                {isCurrent ? <p className="mt-5 text-center text-xs font-medium text-accent-text">Your current plan</p>
                  : rank(t) < rank(current) ? <p className="mt-5 text-center text-xs text-fg/40">Included in your plan</p>
                  : t === 'free' ? null : (
                    <div className="mt-5" role="progressbar" aria-label={`Invites toward ${TIERS[t].name}`} aria-valuemin={0} aria-valuemax={need} aria-valuenow={done}>
                      <div className="flex justify-between text-xs text-fg/50"><span>Unlock with invites</span><span>{invited === null ? '...' : `${done}/${need} invites`}</span></div>
                      <div className="mt-1.5 h-[3px] rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / need) * 100}%` }} /></div>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
        <div className={`${panel} mt-3 flex flex-col gap-2 p-5 sm:flex-row sm:items-center`}>
          <input readOnly className={field} value={inviteUrl} placeholder="Loading your invite link..." onFocus={(e) => e.target.select()} aria-label="Your invite link" />
          <button className={`${pillPrimary} shrink-0`} onClick={copyInvite} disabled={!username}>Copy invite link</button>
        </div>
      </section>

      <section>
        <h3 className={`${label} mb-3 text-fg/50`}>Account info</h3>
        <div className={`${panel} divide-y divide-fg/10`}>
          <Info title="Username"><span className="block truncate">{username && handle(username)}</span></Info>
          <Info title="Email"><span className="block truncate">{user.email}</span></Info>
          <Info title="Member since">{joined.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Info>
          <Info title="User ID"><code className="block truncate text-xs text-fg/60">{user.id}</code></Info>
        </div>
      </section>

      <section>
        <h3 className={`${label} mb-3 text-fg/50`}>Change password</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={field} type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changePassword()} />
          <button className={`${pillPrimary} shrink-0`} onClick={changePassword} disabled={saving || !pw}>Update</button>
        </div>
      </section>

      <button className={pillGhost} onClick={onLogout}>Log out</button>
    </div>
  );
}
