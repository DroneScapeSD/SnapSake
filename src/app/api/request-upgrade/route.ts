import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UPGRADABLE, rank, tierOf } from '@/lib/limits';

// There is no payment provider yet, so "Upgrade" records which plan the person asked for.
// It shows up in the admin dashboard, and you activate it by changing their plan there.
export async function POST(req: NextRequest) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tier } = await req.json().catch(() => ({}));
  if (!UPGRADABLE.includes(tier)) return NextResponse.json({ error: 'Pick Plus or Pro' }, { status: 400 });
  const { data: p } = await admin.from('profiles').select('tier').eq('id', user.id).single();
  if (!p) return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
  if (rank(tier) <= rank(tierOf(p.tier))) return NextResponse.json({ error: 'You are already on this plan or a higher one' }, { status: 400 });

  const { error } = await admin.from('profiles').update({ requested_tier: tier }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
