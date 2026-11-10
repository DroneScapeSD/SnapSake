'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  if (!uid) return (
    <main className="min-h-screen grid md:grid-cols-2 bg-white">
      <section className="hidden md:flex flex-col justify-center p-16 bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white">
        <h1 className="text-5xl font-bold">{APP}</h1>
        <p className="mt-4 text-xl text-indigo-100">Your private photo library. Share any photo with exactly the friends you choose, no group chats needed.</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900">Welcome</h2>
          <input className="w-full rounded-lg border border-slate-300 p-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-slate-300 p-3" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && auth(false)} />
          <button className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white hover:bg-indigo-700" onClick={() => auth(false)}>Log in</button>
          <button className="w-full rounded-lg border border-slate-300 py-3 font-medium text-slate-700 hover:bg-slate-50" onClick={() => auth(true)}>Create account</button>
        </div>
        {toast && <div className="fixed bottom-6 rounded-lg bg-slate-900 px-4 py-2 text-white">{toast}</div>}
      </section>
    </main>
  );

  const mine = photos.filter((p) => p.owner_id === uid);
  const shared = photos.filter((p) => p.owner_id !== uid);
  const shown = tab === 'mine' ? mine : shared;
  const pct = Math.min(100, (used / QUOTA) * 100);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (tab === 'mine') upload(e.dataTransfer.files); }}>
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <h1 className="text-xl font-bold text-indigo-600">{APP}</h1>
          <div className="hidden w-56 sm:block">
            <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">{size(used)} of {size(QUOTA)} used</p>
          </div>
          <button className="text-sm text-slate-600 hover:underline" onClick={() => supabase.auth.signOut()}>Log out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full bg-slate-200 p-1">
            {([['mine', 'My Uploads', mine.length], ['shared', 'Shared With Me', shared.length]] as const).map(([k, label, n]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? 'bg-white shadow' : 'text-slate-600'}`}>{label} <span className="text-slate-400">{n}</span></button>
            ))}
          </div>
          {tab === 'mine' && (
            <>
              <button className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700" onClick={() => fileRef.current?.click()}>
                {busy ? `Uploading ${busy}...` : 'Upload photos'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </>
          )}
        </div>

        {!loaded ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-200" />)}</div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 py-24 text-center text-slate-500">
            {tab === 'mine' ? 'No photos yet. Click Upload or drop images anywhere on this page.' : 'Nothing has been shared with you yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((p) => (
              <button key={p.id} onClick={() => openPhoto(p)} className="group aspect-square overflow-hidden rounded-xl bg-slate-200">
                {urls[p.id] && !bad[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.id]} alt="" loading="lazy" onError={() => setBad({ ...bad, [p.id]: true })} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-500">{bad[p.id] ? 'Preview unavailable' : 'Loading...'}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white md:flex-row" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-1 items-center justify-center bg-black">
              {urls[open.id] && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[open.id]} alt="" className="max-h-[70vh] w-full object-contain" />)}
            </div>
            <aside className="w-full space-y-4 overflow-y-auto p-5 md:w-80">
              <div className="flex items-start justify-between">
                <div><p className="break-all font-medium">{open.filename}</p><p className="text-xs text-slate-500">{size(open.size_bytes)}</p></div>
                <button className="text-slate-400 hover:text-slate-700" onClick={() => setOpen(null)}>✕</button>
              </div>
              {open.owner_id === uid ? (
                <>
                  <div>
                    <p className="text-sm font-medium">Share with a friend</p>
                    <p className="text-xs text-slate-500">{info ? `${info.used} of ${LIMIT} recipient slots used (lifetime)` : ' '}</p>
                    <div className="mt-2 flex gap-2">
                      <input className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm" placeholder="friend@email.com" value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && share()} />
                      <button className="rounded-lg bg-indigo-600 px-3 text-sm text-white" onClick={share}>Share</button>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {info?.recipients.length === 0 && <li className="text-sm text-slate-500">Not shared with anyone.</li>}
                    {info?.recipients.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                        <span className="truncate">{r.email}</span>
                        <button className="text-red-600 hover:underline" onClick={() => unshare(r.id)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                  <button className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50" onClick={del}>Delete photo</button>
                </>
              ) : <p className="text-sm text-slate-600">This photo was shared with you.</p>}
            </aside>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{toast}</div>}
    </div>
  );
}
