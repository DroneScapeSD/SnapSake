'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Inter_Tight, Instrument_Serif } from 'next/font/google';
import { supabase } from '@/lib/supabase';

const sans = Inter_Tight({ subsets: ['latin'], display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap' });

const APP = 'PhotoApp'; // change to your app's name
const QUOTA = 3 * 1024 ** 3;
const LIMIT = 3;
type Photo = { id: string; owner_id: string; filename: string; size_bytes: number };
type Info = { recipients: { id: string; email: string }[]; used: number };
const size = (b: number) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(1) + ' MB');
const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';
const api = async (path: string, body: object) => fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });

async function sha256(f: File) {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Shared style strings (edit here to restyle the whole app)
const field = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-white/35 focus:border-white/30 focus:bg-white/[0.07]';
const pillPrimary = 'rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/85 active:scale-[0.98]';
const pillGhost = 'rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10 active:scale-[0.98]';
const label = 'text-xs uppercase tracking-[0.2em]';

export default function Home() {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [used, setUsed] = useState(0);
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [open, setOpen] = useState<Photo | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(0);
  const [toast, setToast] = useState('');
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUid(data.session?.user.id ?? null); setReady(true); });
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null));
    return () => l.subscription.unsubscribe();
  }, []);

  // Keep the area behind/around the page dark (overscroll on phones, etc.)
  useEffect(() => { document.body.style.background = '#0A0A0B'; }, []);

  // Close the viewer with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('photos').select('id,owner_id,filename,size_bytes').order('created_at', { ascending: false });
    setPhotos(data ?? []); setLoaded(true);
    const { data: pr } = await supabase.from('profiles').select('used_bytes').single();
    setUsed(pr?.used_bytes ?? 0);
    if (data?.length) { const r = await api('/api/photo-urls', { ids: data.map((p) => p.id) }); if (r.ok) setUrls(await r.json()); }
  }, []);
  useEffect(() => { if (uid) load(); }, [uid, load]);

  async function auth(signup: boolean) {
    const { error } = signup ? await supabase.auth.signUp({ email, password: pw }) : await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) say(error.message);
  }

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
    if (!open || !confirm('Delete this photo for everyone?')) return;
    await api('/api/delete', { id: open.id });
    setOpen(null); load();
  }

  if (!ready) return null;

  const toastEl = toast && (
    <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black shadow-lg">{toast}</div>
  );

  if (!uid) return (
    <main className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_0%,rgba(245,166,35,0.16),transparent_70%),radial-gradient(50%_40%_at_0%_100%,rgba(99,102,241,0.12),transparent_70%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 md:grid-cols-[1.2fr_1fr]">
        <section>
          <p className={`${label} text-white/50`}>{APP}</p>
          <h1 className="mt-6 text-[clamp(2.75rem,8vw,6rem)] font-semibold leading-[0.95] tracking-tight">
            Your photos.<br />
            <span className={`${serif.className} font-normal italic text-[#F5A623]`}>Shared</span> on purpose.
          </h1>
          <p className="mt-6 max-w-md text-lg text-white/60">
            A private photo library. Send any photo to exactly the friends you choose, no group chats needed.
          </p>
        </section>
        <section>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome</h2>
            <p className="mt-1 text-sm text-white/50">Log in or create an account.</p>
            <div className="mt-6 space-y-3">
              <input className={field} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={field} type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && auth(false)} />
              <button className={`${pillPrimary} w-full`} onClick={() => auth(false)}>Log in</button>
              <button className={`${pillGhost} w-full`} onClick={() => auth(true)}>Create account</button>
            </div>
          </div>
        </section>
      </div>
      {toastEl}
    </main>
  );

  const mine = photos.filter((p) => p.owner_id === uid);
  const shared = photos.filter((p) => p.owner_id !== uid);
  const shown = tab === 'mine' ? mine : shared;
  const pct = Math.min(100, (used / QUOTA) * 100);

  return (
    <div className={`${sans.className} min-h-screen bg-[#0A0A0B] text-white`}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (tab === 'mine') upload(e.dataTransfer.files); }}>
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0A0A0B]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
          <h1 className="text-sm font-semibold uppercase tracking-[0.25em]">{APP}</h1>
          <div className="flex items-center gap-6">
            <div className="hidden w-48 sm:block">
              <div className="flex justify-between text-[11px] text-white/50"><span>{size(used)}</span><span>{size(QUOTA)}</span></div>
              <div className="mt-1.5 h-[3px] rounded-full bg-white/10"><div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${pct}%` }} /></div>
            </div>
            <button className={`${label} text-white/60 transition hover:text-white`} onClick={() => supabase.auth.signOut()}>Log out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
              {tab === 'mine'
                ? <>My <span className={`${serif.className} font-normal italic`}>library</span></>
                : <>Shared <span className={`${serif.className} font-normal italic`}>with me</span></>}
            </h2>
            <p className="mt-3 text-sm text-white/50">{shown.length} {shown.length === 1 ? 'photo' : 'photos'}</p>
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

        <nav className="flex gap-8 border-b border-white/10">
          {([['mine', 'My Uploads', mine.length], ['shared', 'Shared With Me', shared.length]] as const).map(([k, text, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`${label} -mb-px border-b-2 pb-3 transition ${tab === k ? 'border-white text-white' : 'border-transparent text-white/45 hover:text-white/80'}`}>
              {text} <span className="ml-1 text-white/35">{n}</span>
            </button>
          ))}
        </nav>

        {!loaded ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.06]" />)}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 px-6 py-28 text-center">
            <p className={`${serif.className} text-4xl italic text-white/80`}>{tab === 'mine' ? 'Nothing here yet.' : 'Nothing shared with you yet.'}</p>
            <p className="mt-3 text-sm text-white/45">{tab === 'mine' ? 'Click Upload or drop images anywhere on this page.' : 'Photos your friends share with you will appear here.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <button key={p.id} onClick={() => openPhoto(p)} className="group relative aspect-[4/5] overflow-hidden rounded-3xl bg-white/[0.06] ring-1 ring-white/10 focus-visible:ring-2 focus-visible:ring-white">
                {urls[p.id] && !bad[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.id]} alt="" loading="lazy" onError={() => setBad({ ...bad, [p.id]: true })} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-white/40">{bad[p.id] ? 'Preview unavailable' : 'Loading...'}</div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-left opacity-0 transition group-hover:opacity-100">
                  <p className="truncate text-xs text-white/90">{p.filename}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111113] md:flex-row" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-1 items-center justify-center bg-black">
              {urls[open.id] && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[open.id]} alt="" className="max-h-[70vh] w-full object-contain" />)}
            </div>
            <aside className="w-full space-y-6 overflow-y-auto p-6 md:w-80">
              <div className="flex items-start justify-between gap-3">
                <div><p className="break-all font-medium">{open.filename}</p><p className="mt-0.5 text-xs text-white/45">{size(open.size_bytes)}</p></div>
                <button aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => setOpen(null)}>✕</button>
              </div>
              {open.owner_id === uid ? (
                <>
                  <div>
                    <p className={`${label} text-white/50`}>Share with a friend</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: LIMIT }).map((_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${info && i < info.used ? 'bg-[#F5A623]' : 'bg-white/15'}`} />)}
                      </div>
                      <p className="text-xs text-white/45">{info ? `${info.used} of ${LIMIT} slots used (lifetime)` : ' '}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/30" placeholder="friend@email.com" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && share()} />
                      <button className="rounded-full bg-white px-4 text-sm font-medium text-black transition hover:bg-white/85" onClick={share}>Share</button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {info?.recipients.length === 0 && <li className="text-sm text-white/45">Not shared with anyone.</li>}
                    {info?.recipients.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm">
                        <span className="truncate">{r.email}</span>
                        <button className="text-red-400 transition hover:text-red-300" onClick={() => unshare(r.id)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                  <button className="w-full rounded-full border border-red-400/30 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10" onClick={del}>Delete photo</button>
                </>
              ) : <p className="text-sm text-white/55">This photo was shared with you.</p>}
            </aside>
          </div>
        </div>
      )}
      {toastEl}
    </div>
  );
}
