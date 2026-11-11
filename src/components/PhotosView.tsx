'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { serif } from '@/lib/fonts';
import { LIMIT, api, label, pillPrimary, size } from '@/lib/ui';

type Photo = { id: string; owner_id: string; filename: string; size_bytes: number };
type Info = { recipients: { id: string; email: string }[]; used: number };

async function sha256(f: File) {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function PhotosView({ uid, active, say, onChanged }: {
  uid: string;
  active: boolean; // false while another sidebar section is showing (this view stays mounted so uploads keep going)
  say: (m: string) => void;
  onChanged: () => void; // tell the parent storage usage may have changed
}) {
  const { prefs } = usePrefs();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [open, setOpen] = useState<Photo | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(0);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // Close the viewer with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const load = useCallback(
    () => supabase.from('photos').select('id,owner_id,filename,size_bytes').order('created_at', { ascending: false }).then(async ({ data }) => {
      setPhotos(data ?? []); setLoaded(true);
      onChanged();
      if (data?.length) { const r = await api('/api/photo-urls', { ids: data.map((p) => p.id) }); if (r.ok) setUrls(await r.json()); }
    }),
    [onChanged],
  );
  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    setBusy((n) => n + list.length);
    for (const f of list) {
      try {
        const r = await api('/api/upload-url', { filename: f.name, size: f.size, type: f.type, hash: await sha256(f) });
        const j = await r.json();
        if (!r.ok) { say(`${f.name}: ${j.error}`); continue; }
        const put = await fetch(j.url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f }).catch(() => null);
        if (!put || !put.ok) { await api('/api/delete', { id: j.id }); say(`${f.name}: upload failed (check R2 CORS)`); }
      } finally { setBusy((n) => n - 1); }
    }
    load();
  }

  async function openPhoto(p: Photo) {
    setOpen(p); setInfo(null); setTo('');
    if (p.owner_id === uid) { const { data } = await supabase.rpc('share_info', { p_photo_id: p.id }); setInfo(data); }
  }
  async function refreshInfo() { if (open) { const { data } = await supabase.rpc('share_info', { p_photo_id: open.id }); setInfo(data); } }

  async function share() {
    if (!open || !to.trim()) return;
    const { error } = await supabase.rpc('share_photo', { p_photo_id: open.id, p_email: to });
    if (error) return say(error.message);
    setTo(''); say('Shared'); refreshInfo();
  }
  async function unshare(rid: string) {
    if (!open) return;
    await supabase.rpc('unshare_photo', { p_photo_id: open.id, p_recipient: rid });
    refreshInfo();
  }
  async function del() {
    if (!open) return;
    if (prefs.confirmDelete && !confirm('Delete this photo for everyone?')) return;
    await api('/api/delete', { id: open.id });
    setOpen(null); load();
  }

  const mine = photos.filter((p) => p.owner_id === uid);
  const shared = photos.filter((p) => p.owner_id !== uid);
  const shown = tab === 'mine' ? mine : shared;
  const grid = prefs.density === 'compact'
    ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6'
    : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div hidden={!active} className="min-h-full" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (active && tab === 'mine') upload(e.dataTransfer.files); }}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
              {tab === 'mine'
                ? <>My <span className={`${serif.className} font-normal italic`}>library</span></>
                : <>Shared <span className={`${serif.className} font-normal italic`}>with me</span></>}
            </h2>
            <p className="mt-3 text-sm text-fg/50">{shown.length} {shown.length === 1 ? 'photo' : 'photos'}</p>
          </div>
          {tab === 'mine' && (
            <>
              <button className={pillPrimary} onClick={() => fileRef.current?.click()}>
                {busy ? `Uploading ${busy}...` : 'Upload photos'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </>
          )}
        </div>

        <nav className="flex gap-8 border-b border-fg/10">
          {([['mine', 'My Uploads', mine.length], ['shared', 'Shared With Me', shared.length]] as const).map(([k, text, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`${label} -mb-px border-b-2 pb-3 transition ${tab === k ? 'border-fg text-fg' : 'border-transparent text-fg/45 hover:text-fg/80'}`}>
              {text} <span className="ml-1 text-fg/35">{n}</span>
            </button>
          ))}
        </nav>

        {!loaded ? (
          <div className={grid}>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-fg/[0.06]" />)}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-28 text-center">
            <p className={`${serif.className} text-4xl italic text-fg/80`}>{tab === 'mine' ? 'Nothing here yet.' : 'Nothing shared with you yet.'}</p>
            <p className="mt-3 text-sm text-fg/45">{tab === 'mine' ? 'Click Upload or drop images anywhere on this page.' : 'Photos your friends share with you will appear here.'}</p>
          </div>
        ) : (
          <div className={grid}>
            {shown.map((p) => (
              <button key={p.id} onClick={() => openPhoto(p)} className="group relative aspect-[4/5] overflow-hidden rounded-3xl bg-fg/[0.06] ring-1 ring-fg/10 focus-visible:ring-2 focus-visible:ring-fg">
                {urls[p.id] && !bad[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.id]} alt="" loading="lazy" onError={() => setBad({ ...bad, [p.id]: true })} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-fg/40">{bad[p.id] ? 'Preview unavailable' : 'Loading...'}</div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-left opacity-0 transition group-hover:opacity-100">
                  <p className="truncate text-xs text-white/90">{p.filename}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {open && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface text-fg md:flex-row" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-1 items-center justify-center bg-black">
              {urls[open.id] && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[open.id]} alt="" className="max-h-[70vh] w-full object-contain" />)}
            </div>
            <aside className="w-full space-y-6 overflow-y-auto p-6 md:w-80">
              <div className="flex items-start justify-between gap-3">
                <div><p className="break-all font-medium">{open.filename}</p><p className="mt-0.5 text-xs text-fg/45">{size(open.size_bytes)}</p></div>
                <button aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fg/15 text-fg/60 transition hover:bg-fg/10 hover:text-fg" onClick={() => setOpen(null)}>✕</button>
              </div>
              {open.owner_id === uid ? (
                <>
                  <div>
                    <p className={`${label} text-fg/50`}>Share with a friend</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: LIMIT }).map((_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${info && i < info.used ? 'bg-accent' : 'bg-fg/15'}`} />)}
                      </div>
                      <p className="text-xs text-fg/45">{info ? `${info.used} of ${LIMIT} slots used (lifetime)` : ' '}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input className="min-w-0 flex-1 rounded-xl border border-fg/10 bg-fg/[0.04] px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg/35 focus:border-fg/30" placeholder="friend@email.com" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && share()} />
                      <button className="rounded-full bg-fg px-4 text-sm font-medium text-bg transition hover:bg-fg/85" onClick={share}>Share</button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {info?.recipients.length === 0 && <li className="text-sm text-fg/45">Not shared with anyone.</li>}
                    {info?.recipients.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-fg/[0.05] px-3 py-2.5 text-sm">
                        <span className="truncate">{r.email}</span>
                        <button className="text-red-500 transition hover:text-red-400" onClick={() => unshare(r.id)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                  <button className="w-full rounded-full border border-red-500/30 py-2.5 text-sm text-red-500 transition hover:bg-red-500/10" onClick={del}>Delete photo</button>
                </>
              ) : <p className="text-sm text-fg/55">This photo was shared with you.</p>}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
