// Client-side photo compression: fit inside 1080p and re-encode as WebP, keeping the aspect ratio.
const MAX_LONG = 1920; // long edge, in px
const MAX_SHORT = 1080; // short edge, in px (so portrait photos become 1080 x 1920 at most)
const QUALITY = 0.82;

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));

export async function compressImage(file: File): Promise<File> {
  // 'from-image' applies the photo's EXIF rotation, so phone photos don't end up sideways.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width: w, height: h } = bmp;
  // Never upscale; small photos keep their size and are only re-encoded.
  const scale = Math.min(1, MAX_LONG / Math.max(w, h), MAX_SHORT / Math.min(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, cw, ch);
  bmp.close();

  let blob = await toBlob(canvas, 'image/webp', QUALITY);
  // A few browsers can't encode WebP and silently return PNG; JPEG is a much smaller fallback.
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error('Could not compress image');

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
}
