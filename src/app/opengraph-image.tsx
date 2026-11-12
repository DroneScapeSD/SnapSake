import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = `${SITE.name} – ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#0a0a0a', color: '#fafafa' }}>
        <div style={{ fontSize: 28, letterSpacing: 8, textTransform: 'uppercase', color: '#f5a623' }}>{SITE.name}</div>
        <div style={{ fontSize: 96, fontWeight: 700, marginTop: 32, lineHeight: 1.02, display: 'flex' }}>Your photos. Shared on purpose.</div>
        <div style={{ fontSize: 34, marginTop: 36, color: '#a3a3a3', display: 'flex' }}>A private photo library. Send any photo to exactly the friends you choose.</div>
      </div>
    ),
    size,
  );
}
