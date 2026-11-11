import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, BUCKET } from '@/lib/r2';
import { MAX_FILE, QUOTA } from '@/lib/limits';
import { adjustUsed } from '@/lib/usage';

const FULL = 'Storage full. Your 1 GB limit is reached, so delete some photos to upload more.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // albumId present = upload straight into that album (the photo is stored once and kept out of My Uploads).
  const { filename, size, type, hash, albumId } = await req.json();
  if (typeof type !== 'string' || !type.startsWith('image/')) return NextResponse.json({ error: 'Images only' }, { status: 400 });
  if (!(size > 0) || size > MAX_FILE) return NextResponse.json({ error: 'Max 15 MB per photo' }, { status: 400 });
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  if (albumId !== undefined && albumId !== null && (typeof albumId !== 'string' || !UUID.test(albumId))) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  if (albumId) {
    const { data: album } = await admin.from('albums').select('id').eq('id', albumId).eq('owner_id', user.id).single();
    if (!album) return NextResponse.json({ error: 'Not your album' }, { status: 403 });

    // Same photo already uploaded? Reuse it: add it to the album, with no extra storage and no second upload.
    const { data: dup } = await admin.from('photos').select('id').eq('owner_id', user.id).eq('content_hash', hash).limit(1);
    if (dup?.length) {
      const { error } = await admin.from('album_photos').upsert({ album_id: albumId, photo_id: dup[0].id }, { onConflict: 'album_id,photo_id', ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ attached: true, id: dup[0].id });
    }
  }

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
    .insert({ owner_id: user.id, object_key: key, filename, size_bytes: size, content_hash: hash, ...(albumId ? { in_library: false } : {}) })
    .select('id')
    .single();
  if (error) {
    await adjustUsed(admin, user.id, -size);
    if (error.code === '23505') return NextResponse.json({ error: 'You already uploaded this photo' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (albumId) {
    const { error: linkErr } = await admin.from('album_photos').insert({ album_id: albumId, photo_id: photo.id });
    if (linkErr) { // don't leave a hidden, album-less photo behind
      await admin.from('photos').delete().eq('id', photo.id);
      await adjustUsed(admin, user.id, -size);
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }
  }

  const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 300 });
  return NextResponse.json({ url, id: photo.id });
}
