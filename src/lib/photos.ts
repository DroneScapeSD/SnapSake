import { api } from '@/lib/ui';
import { saveBlob, toPngBlob, sharesViaSheet } from '@/lib/download';

// in_library = false means the photo was uploaded straight into an album and is kept out of My Uploads.
export type Photo = { id: string; owner_id: string; filename: string; size_bytes: number; in_library: boolean };

// Short-lived (5 min) signed image links for any photos the signed-in user is allowed to see.
export async function signedUrls(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) { // the API accepts at most 200 ids per call
    const r = await api('/api/photo-urls', { ids: ids.slice(i, i + 200) });
    if (r.ok) Object.assign(out, await r.json());
  }
  return out;
}

// Fetches a photo and converts it to a PNG file. If the signed link has expired it gets a fresh one and retries once.
async function fetchPng(p: Photo, url?: string): Promise<{ file: File; url: string }> {
  const get = async (u?: string) => { const r = await fetch(u ?? ''); if (!r.ok) throw new Error('fetch failed'); return r.blob(); };
  let used = url, blob: Blob;
  try { blob = await get(url); }
  catch {
    used = (await signedUrls([p.id]))[p.id];
    if (!used) throw new Error('no link');
    blob = await get(used);
  }
  const name = p.filename.replace(/\.[^.]+$/, '') + '.png';
  return { file: new File([await toPngBlob(blob)], name, { type: 'image/png' }), url: used as string };
}

// iPhones only open the share sheet straight after a tap, so the PNG has to be ready by then. When a photo is opened we
// prepare it in the background and keep the last couple (photos are big, so not more).
const prepared = new Map<string, Promise<{ file: File; url: string }>>();
function getPrepared(p: Photo, url?: string) {
  let hit = prepared.get(p.id);
  if (!hit) {
    hit = fetchPng(p, url);
    hit.catch(() => prepared.delete(p.id)); // a failed attempt shouldn't be remembered
    prepared.set(p.id, hit);
    if (prepared.size > 2) prepared.delete(prepared.keys().next().value as string);
  }
  return hit;
}
export function prepareDownload(p: Photo, url?: string) {
  if (url && sharesViaSheet()) getPrepared(p, url).catch(() => {});
}

// iPhone / iPad: opens the share sheet from the bottom (Save Image, AirDrop, Messages...). Everything else: downloads a PNG.
// Resolves to the link that worked; throws if the photo can't be saved. Throws 'tap-again' on iPhone if the photo was still
// being prepared when the sheet was asked for; it is ready by the next tap. Other iPhone failures throw 'share:<reason>'.
export const TAP_AGAIN = 'tap-again';
// The message shown when downloadPhoto throws.
export function shareMessage(e: unknown) {
  const m = (e as Error)?.message ?? '';
  if (m === TAP_AGAIN) return 'Photo is ready. Tap again to share it.';
  if (m.startsWith('share:')) return `Couldn't open the share sheet (${m.slice(6)})`;
  return "Couldn't download this photo";
}
export async function downloadPhoto(p: Photo, url?: string): Promise<string> {
  if (sharesViaSheet()) {
    const { file, url: used } = await getPrepared(p, url);
    try {
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) throw Object.assign(new Error('files not supported'), { name: 'NotSupportedError' });
      await navigator.share({ files: [file] });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'AbortError') return used; // they closed the sheet
      if (name === 'NotAllowedError') throw new Error(TAP_AGAIN); // too long since the tap, so iOS refused the sheet
      // Never fall back to a file download on iPhone (that is the popup this replaces); say what went wrong instead.
      throw new Error(`share:${name ?? 'error'}`);
    }
    return used;
  }
  const { file, url: used } = await fetchPng(p, url);
  saveBlob(file, file.name);
  return used;
}
