import type { SupabaseClient } from '@supabase/supabase-js';

// Adds `delta` bytes (negative to free space) to a user's storage usage as one compare-and-swap,
// so parallel requests can't overwrite each other or squeeze past the quota.
// Pass a cap to refuse any change that would end above it. Returns 'ok', 'full' or 'error'.
export async function adjustUsed(admin: SupabaseClient, uid: string, delta: number, cap?: number): Promise<'ok' | 'full' | 'error'> {
  for (let i = 0; i < 5; i++) {
    const { data: p } = await admin.from('profiles').select('used_bytes').eq('id', uid).single();
    if (!p) return 'error';
    const next = Math.max(0, p.used_bytes + delta);
    if (cap !== undefined && next > cap) return 'full';
    const { data: done } = await admin.from('profiles').update({ used_bytes: next }).eq('id', uid).eq('used_bytes', p.used_bytes).select('id');
    if (done?.length) return 'ok'; // nobody changed the number between our read and write
  }
  return 'error';
}
