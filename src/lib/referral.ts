// Invite links look like https://yoursite/?ref=<username>. The code is remembered until the new person is logged in,
// then claim_referral() (supabase/invites.sql) records who invited them.
const KEY = 'snapsake-ref';

export function captureReferral() {
  try {
    const r = new URLSearchParams(location.search).get('ref')?.trim().replace(/^@/, '').slice(0, 30);
    if (r) localStorage.setItem(KEY, r);
  } catch { /* storage blocked: the invite just won't be counted */ }
}
export const getReferral = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const clearReferral = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
