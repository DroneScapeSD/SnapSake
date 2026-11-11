import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/ui';

export type Album = {
  id: string;
  name: string;
  is_owner: boolean;
  owner_email: string;
  created_at: string;
  share_token: string | null; // only the owner receives this
  photo_ids: string[]; // newest first
  member_count: number;
  members: { user_id: string; email: string }[]; // only filled in for the owner
};

// ---- Share links: https://your-site/?join=<token> ----
const TOKEN_RE = /^[0-9a-f]{32}$/;
const KEY = 'pendingAlbumToken';
export const albumLink = (token: string) => `${location.origin}/?join=${token}`;

// The token is kept in localStorage so it survives signing up (including an email-confirmation round trip).
export const getPendingAlbum = () => { try { const t = localStorage.getItem(KEY); return t && TOKEN_RE.test(t) ? t : null; } catch { return null; } };
export const clearPendingAlbum = () => { try { localStorage.removeItem(KEY); } catch {} };
// Call once on page load: stores a ?join= token from the URL and removes it from the address bar.
export function captureAlbumInvite() {
  const t = new URLSearchParams(location.search).get('join');
  if (!t) return;
  if (TOKEN_RE.test(t)) { try { localStorage.setItem(KEY, t); } catch {} }
  const q = new URLSearchParams(location.search); q.delete('join');
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
}

export function useAlbums(uid: string | null) {
  const [items, setItems] = useState<Album[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [setupError, setSetupError] = useState(false); // true if the albums SQL hasn't been run yet
  const [openId, setOpenId] = useState<string | null>(null); // album currently open in the Albums tab

  const refresh = useCallback(
    () => supabase.rpc('albums_overview').then(({ data, error }) => {
      if (Array.isArray(data)) { setItems(data as Album[]); setSetupError(false); }
      else if (error) setSetupError(true);
      setLoaded(true);
    }),
    [],
  );

  useEffect(() => {
    if (!uid) return;
    refresh();
    window.addEventListener('focus', refresh);
    const poll = setInterval(refresh, 30000); // pick up new members and photos
    return () => { window.removeEventListener('focus', refresh); clearInterval(poll); };
  }, [uid, refresh]);

  // Every action resolves to { data, error } and refreshes the list when it worked.
  const call = async (fn: string, args: object) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (!error) await refresh();
    return { data: data as unknown, error: error?.message ?? null };
  };
  const fail = async (fn: string, args: object) => (await call(fn, args)).error;

  return {
    items, loaded, setupError, openId, setOpenId, refresh,
    create: async (name: string, photoIds: string[]) => {
      const r = await call('create_album', { p_name: name, p_photo_ids: photoIds });
      return { id: r.data as string | null, error: r.error };
    },
    join: async (token: string) => {
      const r = await call('join_album', { p_token: token });
      return { album: r.data as { id: string; name: string } | null, error: r.error };
    },
    resetLink: async (id: string) => fail('reset_album_link', { p_album: id }),
    rename: (id: string, name: string) => fail('rename_album', { p_album: id, p_name: name }),
    // Goes through the server so photos uploaded directly to the album are also deleted from storage.
    remove: async (id: string) => {
      const r = await api('/api/delete-album', { id });
      const j = await r.json().catch(() => ({}));
      if (r.ok) await refresh();
      return r.ok ? null : ((j.error as string) ?? 'Could not delete the album');
    },
    share: (id: string, userId: string) => fail('add_album_member', { p_album: id, p_user: userId }),
    saveToLibrary: (photoId: string) => fail('move_to_library', { p_photo: photoId }),
    leave: (id: string) => fail('leave_album', { p_album: id }),
    addPhotos: (id: string, photoIds: string[]) => fail('add_photos_to_album', { p_album: id, p_photo_ids: photoIds }),
    removePhoto: (id: string, photoId: string) => fail('remove_photo_from_album', { p_album: id, p_photo: photoId }),
    removeMember: (id: string, userId: string) => fail('remove_album_member', { p_album: id, p_user: userId }),
  };
}
export type Albums = ReturnType<typeof useAlbums>;
