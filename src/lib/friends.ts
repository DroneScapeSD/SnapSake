import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Friendship = {
  id: string; // friendship row id (used to accept / decline / cancel / remove)
  status: 'pending' | 'accepted';
  direction: 'in' | 'out'; // 'in' = they asked you, 'out' = you asked them
  user_id: string;
  email: string;
  created_at: string;
};

export function useFriends(uid: string | null) {
  const [items, setItems] = useState<Friendship[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(
    () => supabase.rpc('friends_overview').then(({ data }) => {
      if (Array.isArray(data)) setItems(data as Friendship[]);
      setLoaded(true);
    }),
    [],
  );

  useEffect(() => {
    if (!uid) return;
    refresh();
    window.addEventListener('focus', refresh); // pick up new requests when the tab regains focus
    const poll = setInterval(refresh, 20000); // and every 20s while the app is open
    return () => { window.removeEventListener('focus', refresh); clearInterval(poll); };
  }, [uid, refresh]);

  // Each action returns an error message, or null on success.
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (!error) await refresh();
    return error?.message ?? null;
  };
  const send = (email: string) => run(supabase.rpc('send_friend_request', { p_email: email }));
  const respond = (id: string, accept: boolean) => run(supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept }));
  const remove = (id: string) => run(supabase.rpc('remove_friendship', { p_id: id })); // cancel a sent request, or unfriend

  return {
    loaded,
    friends: items.filter((f) => f.status === 'accepted'),
    incoming: items.filter((f) => f.status === 'pending' && f.direction === 'in'),
    outgoing: items.filter((f) => f.status === 'pending' && f.direction === 'out'),
    send, respond, remove,
  };
}
export type Friends = ReturnType<typeof useFriends>;
