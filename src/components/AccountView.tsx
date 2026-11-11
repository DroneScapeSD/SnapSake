'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { serif } from '@/lib/fonts';
import { LIMIT, MAX_FILE, QUOTA, field, label, panel, pillGhost, pillPrimary, size } from '@/lib/ui';
import { handle } from '@/lib/username';

function accountAge(iso: string) {
  const start = new Date(iso);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months--;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (months >= 12) {
    const y = Math.floor(months / 12), m = months % 12;
    return m ? `${plural(y, 'year')}, ${plural(m, 'month')}` : plural(y, 'year');
  }
  if (months >= 1) return plural(months, 'month');
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return days < 1 ? 'Joined today' : plural(days, 'day');
}

// Limits shown per plan. Only 'free' is enforced by the app today (QUOTA / LIMIT / MAX_FILE).
const PLANS: Record<string, { name: string; perks: string[] }> = {
  free: { name: 'Free', perks: [`${size(QUOTA)} of storage`, `${LIMIT} recipients per photo`, `${size(MAX_FILE)} max per photo`] },
};

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className={`${panel} p-5`}>
      <p className={`${label} text-fg/50`}>{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg/45">{sub}</p>}
    </div>
  );
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="text-sm text-fg/50">{title}</p>
      <div className="min-w-0 text-sm font-medium">{children}</div>
    </div>
  );
}

export function AccountView({ user, username, tier, used, friendCount, say, onLogout }: {
  user: User; username: string; tier: string; used: number; friendCount: number; say: (m: string) => void; onLogout: () => void;
}) {
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const plan = PLANS[tier] ?? { name: tier.charAt(0).toUpperCase() + tier.slice(1), perks: [] };
  const joined = new Date(user.created_at);

  useEffect(() => {
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).then(({ count }) => setPhotoCount(count ?? 0));
  }, [user.id, used]); // re-count when storage usage changes (upload / delete)

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat title="Account age" value={accountAge(user.created_at)} sub={`Since ${joined.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`} />
        <Stat title="Photos" value={photoCount === null ? '...' : String(photoCount)} sub="Uploaded by you" />
        <Stat title="Friends" value={String(friendCount)} />
      </div>

      <section className={`${panel} p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`${label} text-fg/50`}>Subscription</p>
            <p className={`${serif.className} mt-2 text-4xl italic`}>{plan.name}</p>
          </div>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-text">Current plan</span>
        </div>
        {plan.perks.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-fg/65">
            {plan.perks.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-fg/50"><span>Storage used</span><span>{size(used)} of {size(QUOTA)}</span></div>
          <div className="mt-1.5 h-[3px] rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used / QUOTA) * 100)}%` }} /></div>
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
