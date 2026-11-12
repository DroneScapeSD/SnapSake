import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SITE } from '@/lib/site';

// Server-side gate for the admin dashboard. Two things are required on every admin request:
//   1. a logged-in session whose profile username is SITE.adminUsername (and ADMIN_USER_ID, if you set it), and
//   2. a short-lived token that is only issued after the separate panel password (ADMIN_PANEL_PASSWORD) is entered.
// The browser never decides anything: hiding the sidebar tab is cosmetic, these checks are the real lock.

const TOKEN_TTL_MS = 30 * 60 * 1000;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

// The signing key depends on the panel password, so changing the password also invalidates every issued token.
const secret = () => createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`admin-panel:${process.env.ADMIN_PANEL_PASSWORD}`).digest();
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');
const eq = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest(); // same length, constant-time compare
  return timingSafeEqual(x, y);
};

export function issueToken(uid: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${uid}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp };
}
export function tokenOk(token: unknown, uid: string) {
  if (typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i), [tokenUid, exp] = payload.split('.');
  return tokenUid === uid && Number(exp) > Date.now() && eq(token.slice(i + 1), sign(payload));
}
export const passwordOk = (given: unknown) => typeof given === 'string' && given.length > 0 && eq(given, process.env.ADMIN_PANEL_PASSWORD ?? '');

// Wrong-password lockout: 5 misses in 15 minutes locks that account and that IP for 15 minutes.
// This lives in server memory, so on serverless hosting it is best effort (each instance counts separately). Use a long password.
const misses = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60 * 1000;
export const lockedFor = (key: string) => Math.max(0, (misses.get(key)?.until ?? 0) - Date.now());
export function recordMiss(key: string) {
  const now = Date.now(), cur = misses.get(key);
  const n = cur && cur.until > now ? cur.n + 1 : 1;
  misses.set(key, { n, until: now + WINDOW });
  if (misses.size > 1000) for (const [k, v] of misses) if (v.until < now) misses.delete(k);
}
export const clearMisses = (key: string) => misses.delete(key);
export const isLocked = (key: string) => (misses.get(key)?.n ?? 0) >= 5 && lockedFor(key) > 0;
export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

type Ok = { ok: true; admin: SupabaseClient; user: User };
type No = { ok: false; res: NextResponse };

// Step 1: is this request from the admin account? (Step 2, the panel token, is checked by requireUnlocked.)
export async function requireAdmin(req: NextRequest): Promise<Ok | No> {
  if (!process.env.ADMIN_PANEL_PASSWORD) return { ok: false, res: fail('The admin panel is not set up: add ADMIN_PANEL_PASSWORD to your environment variables.', 503) };
  const admin = adminClient();
  const bearer = (req.headers.get('authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(bearer);
  if (!user) return { ok: false, res: fail('Unauthorized', 401) };
  const { data: prof } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle();
  const pinned = process.env.ADMIN_USER_ID;
  if (prof?.username !== SITE.adminUsername || (pinned && pinned !== user.id)) return { ok: false, res: fail('Forbidden', 403) };
  return { ok: true, admin, user };
}

export async function requireUnlocked(req: NextRequest, body: { adminToken?: unknown }): Promise<Ok | No> {
  const a = await requireAdmin(req);
  if (!a.ok) return a;
  if (!tokenOk(body.adminToken, a.user.id)) return { ok: false, res: fail('locked', 401) };
  return a;
}

export const noStore = (data: object, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export { fail };
