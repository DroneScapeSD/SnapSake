// Plan limits. Imported by both the UI and the server routes, so change them here only.
// The share limits are ALSO enforced inside the database (tier_share_limit() in supabase/tiers.sql). If you change a
// number of shares here, change it there too and re-run that file.

export const TIER_KEYS = ['free', 'plus', 'pro', 'admin'] as const;
export type Tier = (typeof TIER_KEYS)[number];

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const TB = 1024 ** 4;

export type TierSpec = {
  name: string;
  quota: number; // bytes of storage
  shares: number; // recipients per photo, and people per album
  maxFile: number; // bytes per uploaded photo, after compression
  resolution: string; // label for the UI
  // Photos are shrunk to fit inside long x short px (never enlarged). null = uncapped: the original quality is kept.
  fit: { long: number; short: number } | null;
};

export const TIERS: Record<Tier, TierSpec> = {
  free: { name: 'Free', quota: 500 * MB, shares: 2, maxFile: 15 * MB, resolution: '1080p', fit: { long: 1920, short: 1080 } },
  plus: { name: 'Plus', quota: 10 * GB, shares: 5, maxFile: 15 * MB, resolution: '1440p', fit: { long: 2560, short: 1440 } },
  pro: { name: 'Pro', quota: 50 * GB, shares: 10, maxFile: 15 * MB, resolution: '4K', fit: { long: 3840, short: 2160 } },
  admin: { name: 'Admin', quota: 100 * GB, shares: 10, maxFile: 50 * MB, resolution: 'Original quality', fit: null },
};

export const MAX_CUSTOM_QUOTA = 10 * TB; // the most the admin dashboard will accept as a custom limit

export const tierOf = (t?: string | null): Tier => ((TIER_KEYS as readonly string[]).includes(t ?? '') ? (t as Tier) : 'free');
// A custom limit set from the admin dashboard (quota_bytes) wins over the plan's default.
export const quotaFor = (tier: string | undefined | null, custom?: number | null) => custom ?? TIERS[tierOf(tier)].quota;
export const rank = (t: string) => TIER_KEYS.indexOf(tierOf(t));

// "500 MB", "10 GB", "1 TB": for limits, which are round numbers.
export function limitLabel(bytes: number) {
  const [v, u] = bytes >= TB ? [bytes / TB, 'TB'] : bytes >= GB ? [bytes / GB, 'GB'] : [bytes / MB, 'MB'];
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${u}`;
}
