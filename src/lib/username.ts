// Username rules. Keep in sync with supabase/usernames.sql (the database enforces them too).
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RE = new RegExp(`^[a-z0-9]{${USERNAME_MIN},${USERNAME_MAX}}$`);

// What people type: "@Sam", " sam " or "sam" all mean the same account.
export const normalizeUsername = (s: string) => s.trim().replace(/^@/, '').toLowerCase();

// Returns a message describing the problem, or null when the username is valid.
export function checkUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return 'Choose a username';
  if (!/^[a-z0-9]+$/.test(u)) return 'Usernames can only contain letters and numbers';
  if (u.length < USERNAME_MIN) return `Usernames must be at least ${USERNAME_MIN} characters`;
  if (u.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters`;
  return null;
}

// How a username is shown everywhere in the app.
export const handle = (username: string) => `@${username}`;
