import { NextRequest } from 'next/server';
import { clearMisses, clientIp, fail, isLocked, issueToken, lockedFor, noStore, passwordOk, recordMiss, requireAdmin } from '@/lib/admin-server';

// Checks the panel password (separate from the login password) and, if it is right, returns a 30-minute token.
export async function POST(req: NextRequest) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.res;
  const { password } = await req.json().catch(() => ({}));

  const keys = [`u:${a.user.id}`, `ip:${clientIp(req)}`];
  const wait = Math.max(...keys.map((k) => (isLocked(k) ? lockedFor(k) : 0)));
  if (wait > 0) return fail(`Too many wrong passwords. Try again in ${Math.ceil(wait / 60000)} minute(s).`, 429);

  if (!passwordOk(password)) {
    keys.forEach(recordMiss);
    await new Promise((r) => setTimeout(r, 600)); // slows guessing a little more
    return fail('Wrong panel password', 401);
  }
  keys.forEach(clearMisses);
  return noStore(issueToken(a.user.id));
}
