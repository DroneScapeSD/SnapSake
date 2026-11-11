import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2, BUCKET } from '@/lib/r2';
import { adjustUsed } from '@/lib/usage';

export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const { data: p } = await admin.from('photos').select('object_key,size_bytes').eq('id', id).eq('owner_id', user.id).single();
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try { await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: p.object_key })); } catch {}
  await admin.from('photos').delete().eq('id', id); // also removes it from any albums
  await adjustUsed(admin, user.id, -p.size_bytes);
  return NextResponse.json({ ok: true });
}
