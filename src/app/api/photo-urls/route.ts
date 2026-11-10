import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, BUCKET } from '@/lib/r2';

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  // Uses the caller's own token, so row-level security decides which photos they can see.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { ids } = await req.json();
  const { data } = await sb.from('photos').select('id,object_key').in('id', (ids as string[]).slice(0, 200));
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = await getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: p.object_key }), { expiresIn: 300 });
  return NextResponse.json(out);
}
