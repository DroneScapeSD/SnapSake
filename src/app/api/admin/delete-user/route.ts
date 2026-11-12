import { NextRequest } from 'next/server';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { fail, noStore, requireUnlocked } from '@/lib/admin-server';
import { r2, BUCKET } from '@/lib/r2';
import { SITE } from '@/lib/site';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Body: { adminToken, userId }
// Permanently deletes an account: first every stored photo file in R2, then the login itself. Deleting the login removes
// everything else in the database with it (profile, photos, albums, shares, friendships: they all cascade from it).
// The admin account can never be deleted from here.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const a = await requireUnlocked(req, body);
  if (!a.ok) return a.res;

  const { userId } = body;
  if (typeof userId !== 'string' || !UUID.test(userId)) return fail('Bad user id', 400);
  if (userId === a.user.id) return fail('You cannot delete your own account from the admin panel', 400);

  const { data: target } = await a.admin.from('profiles').select('id,username').eq('id', userId).maybeSingle();
  if (!target) return fail('User not found', 404);
  if (target.username === SITE.adminUsername) return fail('The admin account cannot be deleted', 400);

  // 1. Stored files, 100 at a time. If the storage service refuses any, stop before touching the account so it can be retried.
  let photos = 0;
  for (;;) {
    const { data: batch, error } = await a.admin.from('photos').select('id,object_key').eq('owner_id', userId).limit(100);
    if (error) return fail(error.message, 500);
    if (!batch?.length) break;
    try {
      const res = await r2.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch.map((p) => ({ Key: p.object_key })), Quiet: true } }));
      if (res.Errors?.length) return fail(`Could not delete ${res.Errors.length} stored files. The account was not deleted, try again.`, 502);
    } catch {
      return fail('Could not reach file storage. The account was not deleted, try again.', 502);
    }
    const { error: delErr } = await a.admin.from('photos').delete().in('id', batch.map((p) => p.id));
    if (delErr) return fail(delErr.message, 500);
    photos += batch.length;
  }

  // 2. The login. This cascades to the profile and all of their data.
  const { error } = await a.admin.auth.admin.deleteUser(userId);
  if (error) return fail(error.message, 500);
  return noStore({ ok: true, username: target.username, photos });
}
