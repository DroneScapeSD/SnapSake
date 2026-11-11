'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { serif } from '@/lib/fonts';
import { albumLink, type Album, type Albums } from '@/lib/albums';
import { downloadPhoto, type Photo } from '@/lib/photos';
import { field, label, panel, photoGrid, pillGhost, pillPrimary, size } from '@/lib/ui';

const small = 'rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50';
const smallGhost = `${small} border border-fg/15 text-fg hover:bg-fg/10`;
const smallDanger = `${small} text-red-500 hover:bg-red-500/10`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Lets the user tick photos from their library. With askName it also asks for an album name (creating a new album).
function PhotoPicker({ title, confirmLabel, askName, photos, urls, onClose, onConfirm }: {
  title: string; confirmLabel: string; askName?: boolean;
  photos: Photo[]; urls: Record<string, string>;
  onClose: () => void;
  onConfirm: (name: string, ids: string[]) => Promise<void>;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = photos.length > 0 && sel.size === photos.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface text-fg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 p-5 pb-3">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <button aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fg/15 text-fg/60 transition hover:bg-fg/10 hover:text-fg" onClick={onClose}>✕</button>
        </div>
        {askName && (
          <div className="px-5 pb-3">
            <input className={field} placeholder="Album name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        )}
        {photos.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-fg/50">No photos available. Upload some photos first.</p>
        ) : (
          <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto p-5 pt-2 sm:grid-cols-4 md:grid-cols-5">
            {photos.map((p) => {
              const on = sel.has(p.id);
              return (
                <button key={p.id} aria-pressed={on} onClick={() => toggle(p.id)}
                  className={`relative aspect-square overflow-hidden rounded-2xl bg-fg/[0.06] ring-2 transition ${on ? 'ring-accent' : 'ring-transparent hover:ring-fg/20'}`}>
                  {urls[p.id] && <img src={urls[p.id]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  {on && <span aria-hidden className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-sm font-bold text-black">✓</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-fg/10 p-4">
          <button className={`${label} text-fg/60 transition hover:text-fg disabled:opacity-40`} disabled={photos.length === 0}
            onClick={() => setSel(all ? new Set() : new Set(photos.map((p) => p.id)))}>{all ? 'Clear' : 'Select all'}</button>
          <button className={pillPrimary} disabled={busy || sel.size === 0}
            onClick={async () => { setBusy(true); await onConfirm(name, [...sel]); setBusy(false); }}>
            {busy ? 'Saving...' : `${confirmLabel}${sel.size ? ` (${sel.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AlbumsView({ uid, albums, photos, urls, say }: {
  uid: string;
  albums: Albums;
  photos: Photo[]; // every photo this user can see (own, shared with them, and in their albums)
  urls: Record<string, string>;
  say: (m: string) => void;
}) {
  const { prefs } = usePrefs();
  const [picker, setPicker] = useState<'new' | 'add' | null>(null);
  const [viewer, setViewer] = useState<string | null>(null); // id of the photo open in the viewer
  const [downloading, setDownloading] = useState(false);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const mine = useMemo(() => photos.filter((p) => p.owner_id === uid), [photos, uid]);
  const open = albums.items.find((a) => a.id === albums.openId) ?? null;
  const openPhotos = open ? open.photo_ids.map((id) => byId.get(id)).filter((p): p is Photo => !!p) : [];
  const viewerIndex = viewer ? openPhotos.findIndex((p) => p.id === viewer) : -1;
  const viewing = viewerIndex >= 0 ? openPhotos[viewerIndex] : null;
  const step = (d: number) => { if (openPhotos.length) setViewer(openPhotos[(viewerIndex + d + openPhotos.length) % openPhotos.length].id); };

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const done = (err: string | null, ok?: string) => { say(err ?? ok ?? ''); return !err; };

  async function copy(a: Album) {
    if (!a.share_token) return;
    const link = albumLink(a.share_token);
    try { await navigator.clipboard.writeText(link); say('Link copied'); }
    catch { window.prompt('Copy this link', link); }
  }
  async function rename(a: Album) {
    const n = window.prompt('Rename album', a.name);
    if (n === null || !n.trim()) return;
    done(await albums.rename(a.id, n), 'Album renamed');
  }
  async function del(a: Album) {
    if (!confirm(`Delete the album "${a.name}"? Your photos stay in your library, but everyone loses access through this album.`)) return;
    if (done(await albums.remove(a.id), 'Album deleted')) albums.setOpenId(null);
  }
  async function leave(a: Album) {
    if (!confirm(`Leave "${a.name}"? You can rejoin later with the link.`)) return;
    if (done(await albums.leave(a.id), 'You left the album')) albums.setOpenId(null);
  }
  async function reset(a: Album) {
    if (!confirm('Reset the link? The old link stops working for new people. Current members keep access.')) return;
    done(await albums.resetLink(a.id), 'New link ready. Copy it again to share.');
  }
  async function removeMember(a: Album, userId: string, email: string) {
    if (!confirm(`Remove ${email} from this album?`)) return;
    done(await albums.removeMember(a.id, userId), 'Member removed');
  }
  async function removePhoto(a: Album, id: string) {
    if (!confirm('Remove this photo from the album? It stays in your library.')) return;
    if (done(await albums.removePhoto(a.id, id), 'Removed from album')) setViewer(null);
  }
  async function download(p: Photo) {
    setDownloading(true);
    try { await downloadPhoto(p, urls[p.id]); } catch { say("Couldn't download this photo"); }
    finally { setDownloading(false); }
  }

  const tile = 'group relative aspect-[4/5] overflow-hidden rounded-3xl bg-fg/[0.06] ring-1 ring-fg/10 focus-visible:ring-2 focus-visible:ring-fg';

  // ---------- one album ----------
  if (open) {
    const link = open.share_token ? albumLink(open.share_token) : '';
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button className={`${label} text-fg/50 transition hover:text-fg`} onClick={() => albums.setOpenId(null)}>← All albums</button>
            <h3 className="mt-3 break-words text-3xl font-semibold tracking-tight">{open.name}</h3>
            <p className="mt-1 text-sm text-fg/50">
              {plural(open.photo_ids.length, 'photo')} · {open.is_owner ? 'Created by you' : `Shared by ${open.owner_email}`}
            </p>
          </div>
          {open.is_owner ? (
            <div className="flex flex-wrap gap-2">
              <button className={`${pillPrimary} !px-4 !py-2`} onClick={() => setPicker('add')}>Add photos</button>
              <button className={`${pillGhost} !px-4 !py-2`} onClick={() => rename(open)}>Rename</button>
            </div>
          ) : (
            <button className={`${pillGhost} !px-4 !py-2`} onClick={() => leave(open)}>Leave album</button>
          )}
        </div>

        {open.is_owner && (
          <section className={`${panel} space-y-5 p-5`}>
            <div>
              <p className={`${label} text-fg/50`}>Share link</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input readOnly className={field} value={link} onFocus={(e) => e.target.select()} aria-label="Album share link" />
                <button className={`${pillPrimary} shrink-0`} onClick={() => copy(open)}>Copy link</button>
              </div>
              <p className="mt-2 text-xs text-fg/40">Anyone who opens this link and logs in (or creates an account) is added to this album automatically, and can view and download its photos.</p>
            </div>
            <div>
              <p className={`${label} text-fg/50`}>Members ({open.members.length})</p>
              {open.members.length === 0 ? (
                <p className="mt-2 text-sm text-fg/45">Nobody has joined yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {open.members.map((m) => (
                    <li key={m.user_id} className="flex items-center gap-3 rounded-xl bg-fg/[0.04] px-3 py-2">
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs font-semibold uppercase">{m.email[0]}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
                      <button className={smallDanger} onClick={() => removeMember(open, m.user_id, m.email)}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-fg/10 pt-4">
              <button className={smallGhost} onClick={() => reset(open)}>Reset link</button>
              <button className={smallDanger} onClick={() => del(open)}>Delete album</button>
            </div>
          </section>
        )}

        {open.photo_ids.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-24 text-center">
            <p className={`${serif.className} text-4xl italic text-fg/80`}>This album is empty.</p>
            {open.is_owner && <p className="mt-3 text-sm text-fg/45">Use Add photos to put some of your photos in it.</p>}
          </div>
        ) : (
          <div className={photoGrid(prefs.density === 'compact')}>
            {open.photo_ids.map((id) => {
              const p = byId.get(id);
              if (!p) return <div key={id} className="aspect-[4/5] animate-pulse rounded-3xl bg-fg/[0.06]" />;
              return (
                <button key={id} className={tile} onClick={() => setViewer(id)}>
                  {urls[id]
                    ? <img src={urls[id]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    : <div className="flex h-full items-center justify-center text-xs text-fg/40">Loading...</div>}
                </button>
              );
            })}
          </div>
        )}

        {viewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setViewer(null)}>
            <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface text-fg md:flex-row" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex flex-1 items-center justify-center bg-black">
                {urls[viewing.id] && <img src={urls[viewing.id]} alt="" className="max-h-[70vh] w-full object-contain" />}
                {openPhotos.length > 1 && (
                  <>
                    <button aria-label="Previous photo" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white transition hover:bg-black/70" onClick={() => step(-1)}>‹</button>
                    <button aria-label="Next photo" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white transition hover:bg-black/70" onClick={() => step(1)}>›</button>
                  </>
                )}
              </div>
              <aside className="w-full space-y-4 overflow-y-auto p-6 md:w-72">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="break-all font-medium">{viewing.filename}</p><p className="mt-0.5 text-xs text-fg/45">{size(viewing.size_bytes)} · {viewerIndex + 1} of {openPhotos.length}</p></div>
                  <button aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fg/15 text-fg/60 transition hover:bg-fg/10 hover:text-fg" onClick={() => setViewer(null)}>✕</button>
                </div>
                <button className={`${pillPrimary} w-full !py-2.5`} onClick={() => download(viewing)} disabled={downloading}>{downloading ? 'Preparing...' : 'Download PNG'}</button>
                {open.is_owner && <button className="w-full rounded-full border border-fg/15 py-2.5 text-sm text-fg/80 transition hover:bg-fg/10" onClick={() => removePhoto(open, viewing.id)}>Remove from album</button>}
              </aside>
            </div>
          </div>
        )}

        {picker === 'add' && (
          <PhotoPicker title="Add photos to this album" confirmLabel="Add" photos={mine.filter((p) => !open.photo_ids.includes(p.id))} urls={urls}
            onClose={() => setPicker(null)}
            onConfirm={async (_n, ids) => { if (done(await albums.addPhotos(open.id, ids), `Added ${plural(ids.length, 'photo')}`)) setPicker(null); }} />
        )}
      </div>
    );
  }

  // ---------- all albums ----------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-fg/50">Group photos into an album, then share it with a link.</p>
        <button className={`${pillPrimary} !px-5 !py-2.5`} onClick={() => setPicker('new')}>New album</button>
      </div>

      {albums.setupError ? (
        <div className="rounded-3xl border border-dashed border-red-500/40 px-6 py-16 text-center">
          <p className="text-lg font-medium">Albums aren&apos;t set up on the database yet.</p>
          <p className="mt-2 text-sm text-fg/55">Run <code>supabase/albums.sql</code> in the Supabase SQL Editor, then reload this page.</p>
        </div>
      ) : !albums.loaded ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-fg/[0.06]" />)}</div>
      ) : albums.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-28 text-center">
          <p className={`${serif.className} text-4xl italic text-fg/80`}>No albums yet.</p>
          <p className="mt-3 text-sm text-fg/45">Upload several photos at once and you&apos;ll be offered an album, or tap New album.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {albums.items.map((a) => {
            const cover = a.photo_ids.find((id) => urls[id]);
            return (
              <button key={a.id} className={`${tile} text-left`} onClick={() => albums.setOpenId(a.id)}>
                {cover
                  ? <img src={urls[cover]} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-fg/40">{a.photo_ids.length ? 'Loading...' : 'Empty album'}</div>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-16">
                  <p className="truncate text-sm font-medium text-white">{a.name}</p>
                  <p className="truncate text-xs text-white/70">
                    {plural(a.photo_ids.length, 'photo')}
                    {a.is_owner ? (a.member_count > 0 ? ` · ${a.member_count} joined` : '') : ` · from ${a.owner_email}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {picker === 'new' && (
        <PhotoPicker title="New album" confirmLabel="Create album" askName photos={mine} urls={urls}
          onClose={() => setPicker(null)}
          onConfirm={async (name, ids) => {
            const r = await albums.create(name, ids);
            if (!done(r.error, 'Album created')) return;
            setPicker(null);
            if (r.id) albums.setOpenId(r.id);
          }} />
      )}
    </div>
  );
}
