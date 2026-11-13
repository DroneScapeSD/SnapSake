'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { serif } from '@/lib/fonts';
import { albumLink, type Album, type Albums } from '@/lib/albums';
import { downloadPhoto, prepareDownload, shareMessage, type Photo } from '@/lib/photos';
import { sharesViaSheet } from '@/lib/download';
import type { Friendship } from '@/lib/friends';
import { handle } from '@/lib/username';
import { api, field, label, panel, photoGrid, pillGhost, pillPrimary, size } from '@/lib/ui';

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
          <p className="px-5 py-16 text-center text-sm text-fg/50">
            {askName ? 'No photos in My Uploads yet. Create the album now, then upload photos straight into it.' : 'No photos in My Uploads to add.'}
          </p>
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
          <button className={pillPrimary} disabled={busy || (!askName && sel.size === 0)}
            onClick={async () => { setBusy(true); await onConfirm(name, [...sel]); setBusy(false); }}>
            {busy ? 'Saving...' : `${confirmLabel}${sel.size ? ` (${sel.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Friends checklist: ticking a friend adds them to the album, unticking removes them.
// People who joined through the link but aren't friends stay listed so they can still be removed.
function ShareList({ album, friends, albums, say, onOpenFriends, shareLimit }: {
  album: Album; friends: Friendship[]; albums: Albums; say: (m: string) => void; onOpenFriends: () => void; shareLimit: number;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({}); // optimistic tick while saving
  const [busyId, setBusyId] = useState<string | null>(null);
  const member = new Set(album.members.map((m) => m.user_id));
  const canAdd = new Map(album.members.map((m) => [m.user_id, m.can_add]));
  const rows = [
    ...friends.map((f) => ({ id: f.user_id, username: f.username, viaLink: false })),
    ...album.members.filter((m) => !friends.some((f) => f.user_id === m.user_id)).map((m) => ({ id: m.user_id, username: m.username, viaLink: true })),
  ];

  async function toggle(id: string, on: boolean) {
    if (busyId) return;
    setBusyId(id); setPending({ [id]: on });
    const err = on ? await albums.share(album.id, id) : await albums.removeMember(album.id, id);
    if (err) say(err);
    setPending({}); setBusyId(null);
  }

  async function setCanAdd(id: string, can: boolean) {
    if (busyId) return;
    setBusyId(id);
    const err = await albums.setMemberCanAdd(album.id, id, can);
    if (err) say(err);
    setBusyId(null);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`${label} text-fg/50`}>Share with friends</p>
        <p className="text-xs text-fg/45">{album.members.length} of {shareLimit} people</p>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-fg/15 p-4 text-center">
          <p className="text-sm text-fg/55">You don&apos;t have any friends yet.</p>
          <button className={`${pillGhost} mt-3 !px-4 !py-2`} onClick={onOpenFriends}>Add friends</button>
        </div>
      ) : (
        <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {rows.map((r) => {
            const on = pending[r.id] ?? member.has(r.id);
            return (
              <li key={r.id} className={`flex items-center gap-2 rounded-xl pr-3 transition hover:bg-fg/[0.06] ${on ? 'bg-fg/[0.05]' : ''} ${busyId ? 'opacity-70' : ''}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={on} disabled={!!busyId} onChange={(e) => toggle(r.id, e.target.checked)} />
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs font-semibold uppercase">{r.username?.[0]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{handle(r.username)}</span>
                  {r.viaLink && <span className="shrink-0 text-xs text-fg/40">joined by link</span>}
                </label>
                {on && member.has(r.id) && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-fg/60">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={!!canAdd.get(r.id)} disabled={!!busyId} onChange={(e) => setCanAdd(r.id, e.target.checked)} />
                    Can add
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AlbumsView({ uid, albums, photos, urls, say, friends, onOpenFriends, onUpload, busy, full, reload, shareLimit }: {
  uid: string;
  albums: Albums;
  photos: Photo[]; // every photo this user can see (own, shared with them, and in their albums)
  urls: Record<string, string>;
  say: (m: string) => void;
  friends: Friendship[]; // accepted friends, for the share checklist
  onOpenFriends: () => void;
  onUpload: (albumId: string, files: FileList | File[] | null) => void; // upload straight into an album
  busy: number; // uploads in progress
  full: boolean; // storage limit reached
  shareLimit: number; // how many people an album can be shared with on this plan
  reload: () => void; // re-fetch photos (after deleting or saving one)
}) {
  const { prefs } = usePrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState<'new' | 'add' | null>(null);
  const [viewer, setViewer] = useState<string | null>(null); // id of the photo open in the viewer
  const [downloading, setDownloading] = useState(false);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const mine = useMemo(() => photos.filter((p) => p.owner_id === uid && p.in_library), [photos, uid]); // what "add from My Uploads" can offer
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

  async function copy(token: string | null, what: string) {
    if (!token) return;
    const link = albumLink(token);
    try { await navigator.clipboard.writeText(link); say(`${what} link copied`); }
    catch { window.prompt('Copy this link', link); }
  }
  async function rename(a: Album) {
    const n = window.prompt('Rename album', a.name);
    if (n === null || !n.trim()) return;
    done(await albums.rename(a.id, n), 'Album renamed');
  }
  async function del(a: Album) {
    const direct = openPhotos.filter((p) => !p.in_library).length; // uploaded straight into this album (by you or by people who can add)
    const what = direct
      ? `The ${plural(direct, 'photo')} uploaded directly to this album will be deleted permanently, including any added by other people. Photos saved in My Uploads stay.`
      : 'Your photos stay in My Uploads.';
    if (!confirm(`Delete the album "${a.name}"? ${what} Everyone loses access through this album.`)) return;
    if (done(await albums.remove(a.id), 'Album deleted')) { albums.setOpenId(null); reload(); }
  }
  async function leave(a: Album) {
    if (!confirm(`Leave "${a.name}"? You can rejoin later with the link.`)) return;
    if (done(await albums.leave(a.id), 'You left the album')) albums.setOpenId(null);
  }
  async function reset(a: Album) {
    if (!confirm('Reset the view-only link? The old link stops working for new people. Current members keep access.')) return;
    done(await albums.resetLink(a.id), 'New view-only link ready. Copy it again to share.');
  }
  async function resetAdd(a: Album) {
    if (!confirm('Reset the view & add link? The old link stops working for new people. Current members keep access, including the ability to add photos.')) return;
    done(await albums.resetAddLink(a.id), 'New view & add link ready. Copy it again to share.');
  }
  async function removePhoto(a: Album, id: string) {
    const theirs = open?.is_owner && openPhotos.find((p) => p.id === id)?.owner_id !== uid;
    if (!confirm(`Remove this photo from the album? It stays in ${theirs ? 'their' : 'your'} library.`)) return;
    if (done(await albums.removePhoto(a.id, id), 'Removed from album')) setViewer(null);
  }
  // Photos uploaded straight into the album have no other home, so they can be kept (saved to My Uploads) or deleted.
  async function saveToLibrary(p: Photo) {
    if (done(await albums.saveToLibrary(p.id), 'Saved to My Uploads')) reload();
  }
  async function deletePhoto(p: Photo) {
    if (!confirm(p.owner_id === uid ? 'Delete this photo permanently? It only exists in this album.' : 'Delete this photo permanently? Someone else added it to your album and it only exists here.')) return;
    const r = await api('/api/delete', { id: p.id });
    if (!r.ok) return say("Couldn't delete this photo");
    setViewer(null); say('Photo deleted');
    await albums.refresh(); reload();
  }
  async function download(p: Photo) {
    setDownloading(true);
    try { await downloadPhoto(p, urls[p.id]); } catch (e) { say(shareMessage(e)); }
    finally { setDownloading(false); }
  }
  // On iPhone the share sheet needs the PNG ready the moment you tap, so start preparing it as soon as the photo opens.
  const viewingId = viewing?.id, viewingUrl = viewing ? urls[viewing.id] : undefined;
  useEffect(() => { if (viewing && viewingUrl) prepareDownload(viewing, viewingUrl); }, [viewingId, viewingUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = 'group relative aspect-[4/5] overflow-hidden rounded-3xl bg-fg/[0.06] ring-1 ring-fg/10 focus-visible:ring-2 focus-visible:ring-fg';

  // ---------- one album ----------
  if (open) {
    const link = open.share_token ? albumLink(open.share_token) : '';
    const addLink = open.contribute_token ? albumLink(open.contribute_token) : '';
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button className={`${label} text-fg/50 transition hover:text-fg`} onClick={() => albums.setOpenId(null)}>← All albums</button>
            <h3 className="mt-3 break-words text-3xl font-semibold tracking-tight">{open.name}</h3>
            <p className="mt-1 text-sm text-fg/50">
              {plural(open.photo_ids.length, 'photo')} · {open.is_owner ? 'Created by you' : (open.owner_username ? `Shared by ${handle(open.owner_username)}` : 'Shared with you')}{!open.is_owner && open.can_add ? ' · You can add photos' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {open.can_add && (
              <>
                <button className={`${pillPrimary} !px-4 !py-2`} disabled={full} onClick={() => fileRef.current?.click()}>
                  {full ? 'Storage full' : busy ? `Uploading ${busy}...` : 'Upload photos'}
                </button>
                <button className={`${pillGhost} !px-4 !py-2`} onClick={() => setPicker('add')}>Add from My Uploads</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onUpload(open.id, e.target.files); e.target.value = ''; }} />
              </>
            )}
            {open.is_owner
              ? <button className={`${pillGhost} !px-4 !py-2`} onClick={() => rename(open)}>Rename</button>
              : <button className={`${pillGhost} !px-4 !py-2`} onClick={() => leave(open)}>Leave album</button>}
          </div>
        </div>

        {open.is_owner && (
          <section className={`${panel} space-y-5 p-5`}>
            <div>
              <p className={`${label} text-fg/50`}>View-only link</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input readOnly className={field} value={link} onFocus={(e) => e.target.select()} aria-label="Album view-only link" />
                <button className={`${pillPrimary} shrink-0`} onClick={() => copy(open.share_token, 'View-only')}>Copy link</button>
              </div>
              <p className="mt-2 text-xs text-fg/40">Anyone who opens this link and logs in (or creates an account) is added to this album automatically, and can view and download its photos.</p>
            </div>
            <div>
              <p className={`${label} text-fg/50`}>View &amp; add link</p>
              {open.contribute_token ? (
                <>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input readOnly className={field} value={addLink} onFocus={(e) => e.target.select()} aria-label="Album view and add link" />
                    <button className={`${pillPrimary} shrink-0`} onClick={() => copy(open.contribute_token, 'View & add')}>Copy link</button>
                  </div>
                  <p className="mt-2 text-xs text-fg/40">Same as above, but people who join with this link can also upload photos to the album. Their uploads use their own storage. You can also tick &ldquo;Can add&rdquo; next to anyone below.</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-fg/40">Run <code>supabase/album_contributors.sql</code> in the Supabase SQL Editor to turn this on, then reload.</p>
              )}
            </div>
            <ShareList album={open} friends={friends} albums={albums} say={say} onOpenFriends={onOpenFriends} shareLimit={shareLimit} />
            <div className="flex flex-wrap gap-2 border-t border-fg/10 pt-4">
              <button className={smallGhost} onClick={() => reset(open)}>Reset view-only link</button>
              {open.contribute_token && <button className={smallGhost} onClick={() => resetAdd(open)}>Reset view &amp; add link</button>}
              <button className={smallDanger} onClick={() => del(open)}>Delete album</button>
            </div>
          </section>
        )}

        {open.photo_ids.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-fg/15 px-6 py-24 text-center">
            <p className={`${serif.className} text-4xl italic text-fg/80`}>This album is empty.</p>
            {open.can_add && <p className="mt-3 text-sm text-fg/45">Upload photos straight into it, or add some from My Uploads.</p>}
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
            <div className="flex h-full max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface text-fg md:h-auto md:flex-row" onClick={(e) => e.stopPropagation()}>
              <div className="relative flex min-h-[25%] flex-1 items-center justify-center bg-black md:min-h-0">
                {urls[viewing.id] && <img src={urls[viewing.id]} alt="" className="h-full max-h-full w-full object-contain md:h-auto md:max-h-[70vh]" />}
                {openPhotos.length > 1 && (
                  <>
                    <button aria-label="Previous photo" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white transition hover:bg-black/70" onClick={() => step(-1)}>‹</button>
                    <button aria-label="Next photo" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white transition hover:bg-black/70" onClick={() => step(1)}>›</button>
                  </>
                )}
              </div>
              <aside className="max-h-[60%] w-full shrink-0 space-y-3 overflow-y-auto p-5 md:max-h-none md:w-72 md:space-y-4 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="break-all font-medium">{viewing.filename}</p><p className="mt-0.5 text-xs text-fg/45">{size(viewing.size_bytes)} · {viewerIndex + 1} of {openPhotos.length}</p></div>
                  <button aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fg/15 text-fg/60 transition hover:bg-fg/10 hover:text-fg" onClick={() => setViewer(null)}>✕</button>
                </div>
                <button className={`${pillPrimary} w-full !py-2.5`} onClick={() => download(viewing)} disabled={downloading}>{downloading ? 'Preparing...' : sharesViaSheet() ? 'Share / Save photo' : 'Download PNG'}</button>
                {viewing.in_library && (open.is_owner || viewing.owner_id === uid) && (
                  <button className="w-full rounded-full border border-fg/15 py-2.5 text-sm text-fg/80 transition hover:bg-fg/10" onClick={() => removePhoto(open, viewing.id)}>Remove from album</button>
                )}
                {!viewing.in_library && viewing.owner_id !== uid && open.is_owner && (
                  <>
                    <p className="text-xs text-fg/45">Added to this album by someone else. It isn&apos;t in anyone&apos;s My Uploads.</p>
                    <button className="w-full rounded-full border border-red-500/30 py-2.5 text-sm text-red-500 transition hover:bg-red-500/10" onClick={() => deletePhoto(viewing)}>Delete photo</button>
                  </>
                )}
                {!viewing.in_library && viewing.owner_id === uid && (
                  <>
                    <p className="text-xs text-fg/45">Uploaded straight to this album, so it isn&apos;t in My Uploads.</p>
                    <button className="w-full rounded-full border border-fg/15 py-2.5 text-sm text-fg/80 transition hover:bg-fg/10" onClick={() => saveToLibrary(viewing)}>Save to My Uploads</button>
                    <button className="w-full rounded-full border border-red-500/30 py-2.5 text-sm text-red-500 transition hover:bg-red-500/10" onClick={() => deletePhoto(viewing)}>Delete photo</button>
                  </>
                )}
              </aside>
            </div>
          </div>
        )}

        {picker === 'add' && open.can_add && (
          <PhotoPicker title="Add photos from My Uploads" confirmLabel="Add" photos={mine.filter((p) => !open.photo_ids.includes(p.id))} urls={urls}
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
        <p className="text-sm text-fg/50">Group photos into an album, then share it with friends or a link.</p>
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
          <p className="mt-3 text-sm text-fg/45">Choose several photos at once and you&apos;ll be offered an album, or tap New album.</p>
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
                    {a.is_owner ? (a.member_count > 0 ? ` · ${a.member_count} joined` : '') : (a.owner_username ? ` · from ${handle(a.owner_username)}` : ' · shared with you')}
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
