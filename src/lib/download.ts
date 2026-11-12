// Re-encode any browser-readable image as PNG (lossless, so no further quality loss from the conversion).
export async function toPngBlob(src: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// iPhone / iPad (newer iPads report themselves as a Mac, so check for a touch screen too).
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// True when this device should open the system share sheet (with "Save Image") instead of downloading a file.
export function sharesViaSheet() {
  if (!isIOS() || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
  try { return navigator.canShare({ files: [new File([''], 'photo.png', { type: 'image/png' })] }); } catch { return false; }
}
