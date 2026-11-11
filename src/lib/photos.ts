import { api } from '@/lib/ui';
import { saveBlob, toPngBlob } from '@/lib/download';

export type Photo = { id: string; owner_id: string; filename: string; size_bytes: number };

// Short-lived (5 min) signed image links for any photos the signed-in user is allowed to see.
export async function signedUrls(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) { // the API accepts at most 200 ids per call
    const r = await api('/api/photo-urls', { ids: ids.slice(i, i + 200) });
    if (r.ok) Object.assign(out, await r.json());
  }
  return out;
}

// Saves a photo as a PNG. If the signed link has expired it gets a fresh one and retries once.
// Resolves to the link that worked; throws if the photo can't be downloaded.
export async function downloadPhoto(p: Photo, url?: string): Promise<string> {
  const get = async (u?: string) => { const r = await fetch(u ?? ''); if (!r.ok) throw new Error('fetch failed'); return r.blob(); };
  let used = url, blob: Blob;
  try { blob = await get(url); }
  catch {
    used = (await signedUrls([p.id]))[p.id];
    if (!used) throw new Error('no link');
    blob = await get(used);
  }
  saveBlob(await toPngBlob(blob), p.filename.replace(/\.[^.]+$/, '') + '.png');
  return used as string;
}
