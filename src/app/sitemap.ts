import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

// Public pages only. The app itself is behind login, so there is nothing else to list.
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date('2026-11-11');
  return [
    { url: `${SITE.url}/`, lastModified: updated, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE.url}/privacy`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/terms`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
