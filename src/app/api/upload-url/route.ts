import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, BUCKET } from '@/lib/r2';
import { MAX_FILE, QUOTA } from '@/lib/limits';

const FULL = 'Storage full. Your 1 GB limit is reached, so delete some photos to upload more.';

// Adds `delta` bytes to the user's usage as one compare-and-swap, so parallel uploads can't squeeze past the quota.
// Pass a cap to refuse any change that would end above it. Returns 'ok', 'full' or 'error'.
async function adjustUsed(admin: SupabaseClient, uid: string, delta: number, cap?: number): Promise<'ok' | 'full' | 'error'> {
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

export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, size, type, hash } = await req.json();
  if (typeof type !== 'string' || !type.startsWith('image/')) return NextResponse.json({ error: 'Images only' }, { status: 400 });
  if (!(size > 0) || size > MAX_FILE) return NextResponse.json({ error: 'Max 15 MB per photo' }, { status: 400 });
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  // Block the upload outright once the user is at (or over) their limit, or if this photo wouldn't fit.
  const { data: prof } = await admin.from('profiles').select('used_bytes').eq('id', user.id).single();
  if (!prof) return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
  if (prof.used_bytes >= QUOTA || prof.used_bytes + size > QUOTA) return NextResponse.json({ error: FULL, code: 'quota' }, { status: 403 });

  // Reserve the space first, then undo the reservation if anything below fails.
  const reserved = await adjustUsed(admin, user.id, size, QUOTA);
  if (reserved === 'full') return NextResponse.json({ error: FULL, code: 'quota' }, { status: 403 });
  if (reserved === 'error') return NextResponse.json({ error: 'Server busy, please try again' }, { status: 503 });

  const key = `${user.id}/${crypto.randomUUID()}`;
  const { data: photo, error } = await admin
    .from('photos')
    .insert({ owner_id: user.id, object_key: key, filename, size_bytes: size, content_hash: hash })
    .select('id')
    .single();
  if (error) {
    await adjustUsed(admin, user.id, -size);
    if (error.code === '23505') return NextResponse.json({ error: 'You already uploaded this photo' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 300 });
  return NextResponse.json({ url, id: photo.id });
}
