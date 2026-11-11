import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { USERNAME_RE, normalizeUsername } from '@/lib/username';

// Supabase Auth only signs in with an email, so this looks up the email behind a username on the server
// and signs in there. The browser gets the session back and never sees the email.
const BAD = 'Wrong username or password';
const fail = (error = BAD) => NextResponse.json({ error }, { status: 401 });

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const name = typeof username === 'string' ? normalizeUsername(username) : '';
  if (!USERNAME_RE.test(name) || typeof password !== 'string' || !password) return fail();

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
  const { data: prof } = await admin.from('profiles').select('email').eq('username', name).maybeSingle();
  if (!prof) return fail();

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  const { data, error } = await anon.auth.signInWithPassword({ email: prof.email, password });
  if (error || !data.session) return fail(error?.message === 'Email not confirmed' ? 'Confirm your email address before logging in' : BAD);
  return NextResponse.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}
