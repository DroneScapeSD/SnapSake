import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, BUCKET } from '@/lib/r2';

const MAX_FILE = 15 * 1024 * 1024; // 15 MB per photo
const QUOTA = 3 * 1024 ** 3; // 3 GB per user (about 6 friends fit in 20 GB)

export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, size, type } = await req.json();
  if (typeof type !== 'string' || !type.startsWith('image/')) return NextResponse.json({ error: 'Images only' }, { status: 400 });
  if (!(size > 0) || size > MAX_FILE) return NextResponse.json({ error: 'Max 15 MB per photo' }, { status: 400 });

  const { data: prof } = await admin.from('profiles').select('used_bytes').eq('id', user.id).single();
  if (!prof || prof.used_bytes + size > QUOTA) return NextResponse.json({ error: 'Storage quota reached' }, { status: 400 });

  const key = `${user.id}/${crypto.randomUUID()}`;
  const { data: photo, error } = await admin.from('photos').insert({ owner_id: user.id, object_key: key, filename, size_bytes: size }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('profiles').update({ used_bytes: prof.used_bytes + size }).eq('id', user.id);

  const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 300 });
  return NextResponse.json({ url, id: photo.id });
}
