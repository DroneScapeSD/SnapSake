import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, BUCKET } from '@/lib/r2';
import { adjustUsed } from '@/lib/usage';

// Deletes an album. Photos from the owner's library stay; photos that were uploaded straight into the album
// (and aren't in another album) are deleted for good, including their stored files and storage usage.
export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const { data: album } = await admin.from('albums').select('id').eq('id', id).eq('owner_id', user.id).single();
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: links } = await admin.from('album_photos').select('photo_id').eq('album_id', id);
  const ids = (links ?? []).map((l) => l.photo_id as string);
  let doomed: { id: string; object_key: string; size_bytes: number }[] = [];
  if (ids.length) {
    const { data: only } = await admin.from('photos').select('id,object_key,size_bytes').in('id', ids).eq('owner_id', user.id).eq('in_library', false);
    const { data: elsewhere } = await admin.from('album_photos').select('photo_id').in('photo_id', ids).neq('album_id', id);
    const keep = new Set((elsewhere ?? []).map((l) => l.photo_id as string)); // still needed by another album
    doomed = (only ?? []).filter((p) => !keep.has(p.id));
  }

  for (const p of doomed) { try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: p.object_key })); } catch {} }
  if (doomed.length) {
    await admin.from('photos').delete().in('id', doomed.map((p) => p.id));
    await adjustUsed(admin, user.id, -doomed.reduce((n, p) => n + p.size_bytes, 0));
  }
  const { error } = await admin.from('albums').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: doomed.length });
}
