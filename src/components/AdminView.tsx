'use client';
import { useCallback, useMemo, useState } from 'react';
import { serif } from '@/lib/fonts';
import { MAX_CUSTOM_QUOTA, TIERS, TIER_KEYS, quotaFor, tierOf, type Tier } from '@/lib/limits';
import { api, field, label, limitLabel, panel, pillGhost, pillPrimary, size } from '@/lib/ui';
import { handle } from '@/lib/username';

type Row = {
  id: string; username: string; email: string; tier: string; created_at: string;
  used_bytes: number; quota_bytes: number | null; friend_count: number;
};

const UNITS = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const;
type Unit = keyof typeof UNITS;
const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  storage: 'Most storage used',
  friends: 'Most friends',
  name: 'Username A to Z',
} as const;
type Sort = keyof typeof SORTS;

const small = 'rounded-lg border border-fg/15 bg-bg px-2 py-1.5 text-base text-fg outline-none sm:text-sm transition focus:border-fg/40';

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className={`${panel} p-5`}>
      <p className={`${label} text-fg/50`}>{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg/45">{sub}</p>}
    </div>
  );
}

// Inline editor for one person's storage limit.
function LimitEditor({ current, onSave, onCancel }: { current: number; onSave: (bytes: number | null) => void; onCancel: () => void }) {
  const initial = current >= UNITS.TB ? 'TB' : current >= UNITS.GB ? 'GB' : 'MB';
  const [unit, setUnit] = useState<Unit>(initial);
  const [value, setValue] = useState(String(+(current / UNITS[initial]).toFixed(2)));
  const bytes = Math.round(Number(value) * UNITS[unit]);
  const valid = value.trim() !== '' && Number.isFinite(bytes) && bytes >= 0 && bytes <= MAX_CUSTOM_QUOTA;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input className={`${small} w-24`} type="number" min={0} step="any" inputMode="decimal" aria-label="Storage limit" value={value}
        onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valid) onSave(bytes); if (e.key === 'Escape') onCancel(); }} autoFocus />
      <select className={small} aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
        {(Object.keys(UNITS) as Unit[]).map((u) => <option key={u}>{u}</option>)}
      </select>
      <button className="rounded-full bg-fg px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-40" disabled={!valid} onClick={() => onSave(bytes)}>Save</button>
      <button className="text-xs text-fg/55 underline-offset-2 hover:text-fg hover:underline" onClick={() => onSave(null)}>Use plan default</button>
      <button className="text-xs text-fg/55 underline-offset-2 hover:text-fg hover:underline" onClick={onCancel}>Cancel</button>
    </div>
  );
}

export function AdminView({ say }: { say: (m: string) => void }) {
  // The token lives only in this component's memory: leaving the tab, refreshing, or 30 minutes passing locks the panel again.
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const lock = useCallback((msg?: string) => { setToken(null); setRows(null); setPw(''); if (msg) say(msg); }, [say]);

  // Every admin call sends the panel token; the server rejects anything without a valid one.
  const call = useCallback(async (path: string, tk: string, body: object = {}) => {
    const r = await api(path, { adminToken: tk, ...body });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.error === 'locked') { lock('The panel locked itself. Enter the password again.'); return null; }
    if (!r.ok) { say(j.error ?? 'Something went wrong'); return null; }
    return j;
  }, [lock, say]);

  const load = useCallback(async (tk: string) => {
    const j = await call('/api/admin/users', tk);
    if (j) setRows(j.users as Row[]);
  }, [call]);

  async function unlock() {
    if (!pw || unlocking) return;
    setUnlocking(true); setError('');
    const r = await api('/api/admin/unlock', { password: pw });
    const j = await r.json().catch(() => ({}));
    setUnlocking(false);
    if (!r.ok) { setPw(''); return setError(j.error ?? 'Could not unlock'); }
    setPw(''); setToken(j.token); load(j.token);
  }

  async function update(row: Row, change: { tier?: Tier; quotaBytes?: number | null }, okMsg: string) {
    if (!token) return;
    setSaving(row.id);
    const j = await call('/api/admin/update-user', token, { userId: row.id, ...change });
    setSaving(null);
    if (!j) return;
    setRows((rs) => rs && rs.map((x) => (x.id === row.id ? { ...x, tier: j.user.tier, quota_bytes: j.user.quota_bytes } : x)));
    setEditing(null);
    say(okMsg);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    const list = (rows ?? []).filter((r) => !needle || r.username.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle));
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      storage: (a, b) => b.used_bytes - a.used_bytes,
      friends: (a, b) => b.friend_count - a.friend_count,
      name: (a, b) => a.username.localeCompare(b.username),
    };
    return [...list].sort(by[sort]);
  }, [rows, q, sort]);

  const heading = (
    <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
      Admin <span className={`${serif.className} font-normal italic`}>panel</span>
    </h2>
  );

  // Locked: ask for the panel password.
  if (!token) {
    return (
      <div className="max-w-md space-y-6">
        {heading}
        <form className={`${panel} space-y-3 p-6`} onSubmit={(e) => { e.preventDefault(); unlock(); }}>
          <p className="text-sm text-fg/60">Enter the panel password to continue. It is separate from your login password.</p>
          <input className={field} type="password" name="admin-panel-password" autoComplete="off" placeholder="Panel password" aria-label="Panel password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          <button type="submit" className={`${pillPrimary} w-full`} disabled={!pw || unlocking}>{unlocking ? 'Checking...' : 'Unlock'}</button>
        </form>
      </div>
    );
  }

  const totalUsed = (rows ?? []).reduce((n, r) => n + r.used_bytes, 0);
  const perTier = TIER_KEYS.map((t) => `${(rows ?? []).filter((r) => tierOf(r.tier) === t).length} ${TIERS[t].name}`).join(' · ');
  const friendships = Math.round((rows ?? []).reduce((n, r) => n + r.friend_count, 0) / 2);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}
        <div className="flex gap-2">
          <button className={`${pillGhost} !px-4 !py-2`} onClick={() => load(token)}>Refresh</button>
          <button className={`${pillGhost} !px-4 !py-2`} onClick={() => lock()}>Lock</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat title="Users" value={rows ? String(rows.length) : '...'} sub={rows ? perTier : undefined} />
        <Stat title="Storage used" value={rows ? size(totalUsed) : '...'} sub={rows && rows.length ? `${size(totalUsed / rows.length)} per user on average` : undefined} />
        <Stat title="Friendships" value={rows ? String(friendships) : '...'} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={field} type="search" placeholder="Search username or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${small} sm:w-52`} aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {(Object.keys(SORTS) as Sort[]).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}
        </select>
      </div>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className={`${label} border-b border-fg/10 text-fg/50`}>
              {['Username', 'Email', 'Plan', 'Joined', 'Usage', 'Friends'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/10">
            {rows === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-fg/45">Loading...</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-fg/45">No users match.</td></tr>}
            {shown.map((r) => {
              const quota = quotaFor(r.tier, r.quota_bytes);
              const pct = quota > 0 ? Math.min(100, (r.used_bytes / quota) * 100) : 100;
              const busy = saving === r.id;
              return (
                <tr key={r.id} className={`align-top ${busy ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium">{handle(r.username)}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-fg/70" title={r.email}>{r.email}</td>
                  <td className="px-4 py-3">
                    <select className={small} aria-label={`Plan for ${r.username}`} value={tierOf(r.tier)} disabled={busy}
                      onChange={(e) => update(r, { tier: e.target.value as Tier }, `${handle(r.username)} is now on ${TIERS[e.target.value as Tier].name}`)}>
                      {TIER_KEYS.map((t) => <option key={t} value={t}>{TIERS[t].name}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg/70">{new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap">{size(r.used_bytes)} <span className="text-fg/45">/ {limitLabel(quota)}</span></span>
                      {r.quota_bytes !== null && <span className="rounded-full bg-fg/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg/60">custom</span>}
                      {editing !== r.id && <button className="text-xs text-fg/55 underline-offset-2 hover:text-fg hover:underline" onClick={() => setEditing(r.id)}>Edit limit</button>}
                    </div>
                    <div className="mt-1.5 h-[3px] w-40 rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
                    {editing === r.id && (
                      <LimitEditor current={quota} onCancel={() => setEditing(null)}
                        onSave={(bytes) => update(r, { quotaBytes: bytes }, bytes === null ? `${handle(r.username)} is back on the plan limit` : `${handle(r.username)} limit set to ${limitLabel(bytes)}`)} />
                    )}
                  </td>
                  <td className="px-4 py-3">{r.friend_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg/45">Changing someone&apos;s plan also clears any custom limit, so they start from that plan&apos;s default. Set a custom limit afterwards if you want one.</p>
    </div>
  );
}
