import { NextRequest } from 'next/server';
import { fail, noStore, requireUnlocked } from '@/lib/admin-server';
import { MAX_CUSTOM_QUOTA, TIER_KEYS } from '@/lib/limits';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Body: { adminToken, userId, tier?, quotaBytes? }
//   tier        one of free / plus / pro / admin. Also clears any pending upgrade request and any custom storage limit.
//   quotaBytes  a whole number of bytes for a custom storage limit, or null to go back to the plan's default.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const a = await requireUnlocked(req, body);
  if (!a.ok) return a.res;

  const { userId, tier, quotaBytes } = body;
  if (typeof userId !== 'string' || !UUID.test(userId)) return fail('Bad user id', 400);
  const update: Record<string, unknown> = {};

  if (tier !== undefined) {
    if (!(TIER_KEYS as readonly string[]).includes(tier)) return fail('Unknown plan', 400);
    update.tier = tier;
    update.requested_tier = null;
    update.quota_bytes = null; // a plan change starts from the plan's own limit; send quotaBytes too to set a custom one
  }
  if (quotaBytes !== undefined) {
    if (quotaBytes !== null && (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0 || quotaBytes > MAX_CUSTOM_QUOTA)) return fail('Storage limit must be between 0 and 10 TB', 400);
    update.quota_bytes = quotaBytes;
  }
  if (!Object.keys(update).length) return fail('Nothing to change', 400);

  const { data, error } = await a.admin.from('profiles').update(update).eq('id', userId).select('id,tier,quota_bytes,requested_tier').maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('User not found', 404);
  return noStore({ user: data });
}
