import { TIERS, tierOf } from '@/lib/limits';

// Client-side photo compression. The size depends on the plan: Free 1080p, Plus 1440p, Pro 4K, Admin keeps the original.
// Photos are re-encoded as WebP and keep their aspect ratio. Portrait photos use the same box turned on its side.
const QUALITY = 0.82;
const KEEP_AS_IS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']; // formats every browser can show

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

export async function compressImage(file: File, tier: string): Promise<File> {
  const fit = TIERS[tierOf(tier)].fit;
  // Uncapped plan: a normal photo is uploaded untouched. Formats browsers can't show (e.g. HEIC) are converted at full size below.
  if (!fit && KEEP_AS_IS.includes(file.type)) return file;

  // 'from-image' applies the photo's EXIF rotation, so phone photos don't end up sideways.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width: w, height: h } = bmp;
  // Never upscale; small photos keep their size and are only re-encoded.
  const scale = fit ? Math.min(1, fit.long / Math.max(w, h), fit.short / Math.min(w, h)) : 1;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, cw, ch);
  bmp.close();

  const q = fit ? QUALITY : 0.95;
  let blob = await toBlob(canvas, 'image/webp', q);
  // A few browsers can't encode WebP and silently return PNG; JPEG is a much smaller fallback.
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', fit ? 0.85 : 0.95);
  if (!blob) throw new Error('Could not compress image');

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
}
