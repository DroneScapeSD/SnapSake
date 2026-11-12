import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { quotaFor, tierOf, type Tier } from '@/lib/limits';

type Row = { used_bytes: number; tier?: string; username?: string; quota_bytes?: number | null };

async function fetchProfile(): Promise<Row | null> {
  // Falls back gracefully if newer columns haven't been added yet (see supabase/friends_and_tiers.sql, usernames.sql and tiers.sql).
  for (const cols of ['used_bytes,tier,username,quota_bytes', 'used_bytes,tier,username', 'used_bytes']) {
    const r = await supabase.from('profiles').select(cols).single();
    if (!r.error) return r.data as unknown as Row;
  }
  return null;
}

export function useProfile(uid: string | null) {
  const [used, setUsed] = useState(0);
  const [tier, setTier] = useState<Tier>('free');
  const [custom, setCustom] = useState<number | null>(null);
  const [username, setUsername] = useState('');

  const refresh = useCallback(
    () => fetchProfile().then((p) => {
      setUsed(p?.used_bytes ?? 0); setTier(tierOf(p?.tier)); setUsername(p?.username ?? '');
      setCustom(p?.quota_bytes ?? null);
    }),
    [],
  );

  useEffect(() => { if (uid) refresh(); }, [uid, refresh]);
  // quota = this person's storage limit: a custom one set by the admin, otherwise the plan's.
  return { used, tier, username, quota: quotaFor(tier, custom), refresh };
}
