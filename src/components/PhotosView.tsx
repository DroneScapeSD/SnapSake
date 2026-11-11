'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { serif } from '@/lib/fonts';
import { compressImage } from '@/lib/compress';
import { downloadPhoto, signedUrls, type Photo } from '@/lib/photos';
import type { Friendship } from '@/lib/friends';
import type { Albums } from '@/lib/albums';
import { AlbumsView } from '@/components/AlbumsView';
import { LIMIT, QUOTA, api, field, label, photoGrid, pillGhost, pillPrimary, size } from '@/lib/ui';

export type PhotoTab = 'mine' | 'shared' | 'albums';
type Info = { recipients: { id: string; email: string }[]; used: number };

async function sha256(f: File) {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function PhotosView({ uid, active, say, onChanged, friends, onOpenFriends, tab, onTab, albums, used }: {
  uid: string;
  tab: PhotoTab; // which of My Uploads / Shared With Me / Albums is showing (owned by the page so a share link can open Albums)
  onTab: (t: PhotoTab) => void;
  albums: Albums;
  used: number; // bytes of storage used
  friends: Friendship[]; // accepted friends, for the share checklist
  onOpenFriends: () => void;
  active: boolean; // false while another sidebar section is showing (this view stays mounted so uploads keep going)
  say: (m: string) => void;
  onChanged: () => void; // tell the parent storage usage may have changed
}) {
  const { prefs } = usePrefs();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set()); // photos shared with me directly (as opposed to through an album)
  const [albumPrompt, setAlbumPrompt] = useState<string[] | null>(null); // ids just uploaded together, offered an album
  const [albumName, setAlbumName] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [sharing, setSharing] = useState<string | null>(null); // user id of the checkbox being saved
  const [downloading, setDownloading] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({}); // optimistic checkbox state while saving
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
    () => Promise.all([
      supabase.from('photos').select('id,owner_id,filename,size_bytes').order('created_at', { ascending: false }),
      supabase.from('photo_shares').select('photo_id'),
    ]).then(async ([{ data }, { data: shares }]) => {
      setPhotos(data ?? []); setSharedIds(new Set((shares ?? []).map((s) => s.photo_id))); setLoaded(true);
      onChanged();
      if (data?.length) setUrls(await signedUrls(data.map((p) => p.id)));
    }),
    [onChanged],
  );
  useEffect(() => { load(); }, [load]);

  // Joining an album (or the owner changing it) changes which photos are visible, so reload when the album contents change.
  const albumSig = albums.items.map((a) => `${a.id}:${a.photo_ids.length}`).join();
  const firstSig = useRef(albumSig);
  useEffect(() => { if (albumSig !== firstSig.current) { firstSig.current = albumSig; load(); } }, [albumSig, load]);

  const full = used >= QUOTA;
  const FULL_MSG = `Storage full (${size(QUOTA)}). Delete some photos to upload more.`;

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    if (full) return say(FULL_MSG);
    setBusy((n) => n + list.length);
    const added: string[] = []; // ids of photos from this batch that uploaded successfully
    for (let i = 0; i < list.length; i++) {
      const original = list[i];
      try {
        // Hash the original so re-uploading the same photo is still caught as a duplicate.
        const hash = await sha256(original);
        let f: File;
        try { f = await compressImage(original); } catch { say(`${original.name}: couldn't read this image`); continue; }
        const r = await api('/api/upload-url', { filename: f.name, size: f.size, type: f.type, hash });
        const j = await r.json();
        if (!r.ok) {
          if (j.code === 'quota') { say(j.error); setBusy((n) => n - (list.length - 1 - i)); break; } // out of space: stop the rest of the batch
          say(`${f.name}: ${j.error}`); continue;
        }
        const put = await fetch(j.url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f }).catch(() => null);
        if (!put || !put.ok) { await api('/api/delete', { id: j.id }); say(`${f.name}: upload failed (check R2 CORS)`); }
        else added.push(j.id);
      } finally { setBusy((n) => n - 1); }
    }
    await load();
    // Several photos went up together: offer to put them in an album.
    if (added.length >= 2) { setAlbumName(''); setAlbumPrompt(added); }
  }

  async function createFromUpload() {
    if (!albumPrompt || creating) return;
    setCreating(true);
    const r = await albums.create(albumName, albumPrompt);
    setCreating(false);
    if (r.error) return say(r.error);
    setAlbumPrompt(null); say('Album created');
    onTab('albums'); if (r.id) albums.setOpenId(r.id);
  }

  async function openPhoto(p: Photo) {
    setOpen(p); setInfo(null); setPending({});
    if (p.owner_id === uid) { const { data } = await supabase.rpc('share_info', { p_photo_id: p.id }); setInfo(data); }
  }
  async function refreshInfo() { if (open) { const { data } = await supabase.rpc('share_info', { p_photo_id: open.id }); setInfo(data); } }

  // Checking a friend shares the photo with them; unchecking removes their access.
  async function toggleShare(userId: string, email: string, on: boolean) {
    if (!open || sharing) return;
    setSharing(userId); setPending({ [userId]: on }); // tick instantly; the server result below corrects it if it fails
    const { error } = on
      ? await supabase.rpc('share_photo', { p_photo_id: open.id, p_email: email })
      : await supabase.rpc('unshare_photo', { p_photo_id: open.id, p_recipient: userId });
    if (error) say(error.message);
    await refreshInfo();
    setPending({}); setSharing(null);
  }
  // Saves the photo as a PNG. Works for your own photos and ones shared with you.
  async function download() {
    if (!open || downloading) return;
    setDownloading(true);
    try {
      const used = await downloadPhoto(open, urls[open.id]);
      if (used !== urls[open.id]) setUrls((u) => ({ ...u, [open.id]: used })); // keep the refreshed link
    } catch { say("Couldn't download this photo"); }
    finally { setDownloading(false); }
  }

  async function del() {
    if (!open) return;
    if (prefs.confirmDelete && !confirm('Delete this photo for everyone?')) return;
    await api('/api/delete', { id: open.id });
    setOpen(null); load(); albums.refresh(); // the photo also leaves any album it was in
  }

  const mine = photos.filter((p) => p.owner_id === uid);
  const shared = photos.filter((p) => p.owner_id !== uid && sharedIds.has(p.id)); // album-only photos live in the Albums tab
  const shown = tab === 'mine' ? mine : shared;
  const grid = photoGrid(prefs.density === 'compact');

  return (
    <div hidden={!active} className="min-h-full" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (active && tab === 'mine') upload(e.dataTransfer.files); }}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-tight">
              {tab === 'mine'
                ? <>My <span className={`${serif.className} font-normal italic`}>library</span></>
                : tab === 'shared'
                  ? <>Shared <span className={`${serif.className} font-normal italic`}>with me</span></>
                  : <>My <span className={`${serif.className} font-normal italic`}>albums</span></>}
            </h2>
            <p className="mt-3 text-sm text-fg/50">
              {tab === 'albums'
                ? `${albums.items.length} ${albums.items.length === 1 ? 'album' : 'albums'}`
                : `${shown.length} ${shown.length === 1 ? 'photo' : 'photos'}`}
            </p>
          </div>
          {tab === 'mine' && (
            <>
              <button className={pillPrimary} disabled={full} title={full ? FULL_MSG : undefined} onClick={() => fileRef.current?.click()}>
                {full ? 'Storage full' : busy ? `Uploading ${busy}...` : 'Upload photos'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </>
          )}
        </div>

        {full && tab === 'mine' && (
          <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-500">
            {FULL_MSG} Photos you delete free up space right away.
          </div>
        )}

        <nav className="flex gap-8 border-b border-fg/10">
          {([['mine', 'My Uploads', mine.length], ['shared', 'Shared With Me', shared.length], ['albums', 'Albums', albums.items.length]] as const).map(([k, text, n]) => (
            <button key={k} onClick={() => onTab(k)}
              className={`${label} -mb-px border-b-2 pb-3 transition ${tab === k ? 'border-fg text-fg' : 'border-transparent text-fg/45 hover:text-fg/80'}`}>
              {text} <span className="ml-1 text-fg/35">{n}</span>
            </button>
          ))}
        </nav>

        {tab === 'albums' ? (
          <AlbumsView uid={uid} albums={albums} photos={photos} urls={urls} say={say} />
        ) : !loaded ? (
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

      {albumPrompt && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setAlbumPrompt(null)}>
          <div className="w-full max-w-md space-y-5 rounded-3xl border border-fg/10 bg-surface p-6 text-fg" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Create an album?</h3>
              <p className="mt-1 text-sm text-fg/55">You just uploaded {albumPrompt.length} photos. Put them in an album you can share with a link.</p>
            </div>
            <input className={field} placeholder="Album name" maxLength={60} value={albumName} autoFocus
              onChange={(e) => setAlbumName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createFromUpload()} />
            <div className="flex justify-end gap-2">
              <button className={`${pillGhost} !px-5 !py-2.5`} onClick={() => setAlbumPrompt(null)}>Not now</button>
              <button className={`${pillPrimary} !px-5 !py-2.5`} onClick={createFromUpload} disabled={creating}>{creating ? 'Creating...' : 'Create album'}</button>
            </div>
          </div>
        </div>
      )}

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
              <button className={`${pillPrimary} w-full !py-2.5`} onClick={download} disabled={downloading}>
                {downloading ? 'Preparing...' : 'Download PNG'}
              </button>
              {open.owner_id === uid ? (
                <>
                  <div>
                    <p className={`${label} text-fg/50`}>Share with friends</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: LIMIT }).map((_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${info && i < info.used ? 'bg-accent' : 'bg-fg/15'}`} />)}
                      </div>
                      <p className="text-xs text-fg/45">{info ? `${info.used} of ${LIMIT} slots used (lifetime)` : ' '}</p>
                    </div>
                    {(() => {
                      // Friends first; anyone it was shared with before who isn't (or is no longer) a friend stays listed so you can still remove them.
                      const shared = new Set(info?.recipients.map((r) => r.id));
                      const rows = [
                        ...friends.map((f) => ({ id: f.user_id, email: f.email })),
                        ...(info?.recipients.filter((r) => !friends.some((f) => f.user_id === r.id)) ?? []),
                      ];
                      if (!info) return <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-fg/[0.06]" />)}</div>;
                      if (rows.length === 0) return (
                        <div className="mt-3 rounded-xl border border-dashed border-fg/15 p-4 text-center">
                          <p className="text-sm text-fg/55">You don&apos;t have any friends yet.</p>
                          <button className={`${pillGhost} mt-3 !px-4 !py-2`} onClick={() => { setOpen(null); onOpenFriends(); }}>Add friends</button>
                        </div>
                      );
                      return (
                        <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                          {rows.map((r) => (
                            <li key={r.id}>
                              <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-fg/[0.06] ${(pending[r.id] ?? shared.has(r.id)) ? 'bg-fg/[0.05]' : ''} ${sharing ? 'opacity-70' : ''}`}>
                                <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={pending[r.id] ?? shared.has(r.id)} disabled={!!sharing}
                                  onChange={(e) => toggleShare(r.id, r.email, e.target.checked)} />
                                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs font-semibold uppercase">{r.email[0]}</span>
                                <span className="min-w-0 flex-1 truncate text-sm">{r.email}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
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
