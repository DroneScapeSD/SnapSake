import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Row = { used_bytes: number; tier?: string };

async function fetchProfile(): Promise<Row | null> {
  const full = await supabase.from('profiles').select('used_bytes,tier').single();
  if (!full.error) return full.data as Row;
  // Falls back gracefully if the tier column hasn't been added yet (see supabase/friends_and_tiers.sql).
  const basic = await supabase.from('profiles').select('used_bytes').single();
  return basic.data as Row | null;
}

export function useProfile(uid: string | null) {
  const [used, setUsed] = useState(0);
  const [tier, setTier] = useState('free');

  const refresh = useCallback(
    () => fetchProfile().then((p) => { setUsed(p?.used_bytes ?? 0); setTier(p?.tier ?? 'free'); }),
    [],
  );

  useEffect(() => { if (uid) refresh(); }, [uid, refresh]);
  return { used, tier, refresh };
}
