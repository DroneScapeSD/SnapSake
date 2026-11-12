import type { SupabaseClient } from '@supabase/supabase-js';
import { TIERS, quotaFor, tierOf, type Tier } from '@/lib/limits';

// A user's plan as the server sees it. Reads the tier and any custom storage limit from the database.
// If the new columns don't exist yet (supabase/tiers.sql not run), everyone is treated as Free.
export async function getPlan(admin: SupabaseClient, uid: string) {
  let row: { used_bytes: number; tier?: string; quota_bytes?: number | null } | null = null;
  const full = await admin.from('profiles').select('used_bytes,tier,quota_bytes').eq('id', uid).single();
  if (!full.error) row = full.data;
  else row = (await admin.from('profiles').select('used_bytes').eq('id', uid).single()).data;
  if (!row) return null;
  const tier: Tier = tierOf(row.tier);
  return { tier, used: row.used_bytes, quota: quotaFor(tier, row.quota_bytes), maxFile: TIERS[tier].maxFile };
}
