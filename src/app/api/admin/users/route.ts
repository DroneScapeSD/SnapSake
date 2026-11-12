import { NextRequest } from 'next/server';
import { fail, noStore, requireUnlocked } from '@/lib/admin-server';

// Every user with the numbers the dashboard shows. admin_user_stats() can only be called with the service key (see supabase/tiers.sql).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const a = await requireUnlocked(req, body);
  if (!a.ok) return a.res;
  const { data, error } = await a.admin.rpc('admin_user_stats');
  if (error) return fail(error.message.includes('admin_user_stats') ? 'Run supabase/tiers.sql in the Supabase SQL Editor first.' : error.message, 500);
  return noStore({ users: data ?? [] });
}
