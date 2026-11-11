import { supabase } from '@/lib/supabase';

export const APP = 'Tandem'; // change to your app's name
export const QUOTA = 3 * 1024 ** 3;
export const LIMIT = 3;
export const MAX_FILE = 15 * 1024 * 1024;

export const size = (b: number) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(1) + ' MB');
export const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';
export const api = async (path: string, body: object) =>
  fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });

// Shared style strings (edit here to restyle the whole app). Colors come from the theme tokens in globals.css.
export const field = 'w-full rounded-xl border border-fg/10 bg-fg/[0.04] px-4 py-3 text-[15px] text-fg outline-none transition placeholder:text-fg/35 focus:border-fg/30 focus:bg-fg/[0.07]';
export const pillPrimary = 'rounded-full bg-fg px-6 py-3 text-sm font-medium text-bg transition hover:bg-fg/85 active:scale-[0.98] disabled:opacity-50';
export const pillGhost = 'rounded-full border border-fg/15 px-6 py-3 text-sm font-medium text-fg transition hover:bg-fg/10 active:scale-[0.98] disabled:opacity-50';
export const label = 'text-xs uppercase tracking-[0.2em]';
export const panel = 'rounded-3xl border border-fg/10 bg-fg/[0.03]';
