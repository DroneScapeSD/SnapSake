-- Run once in Supabase > SQL Editor, AFTER tiers.sql. Safe to re-run.
-- Powers profile pages: username, plan, join date, photos uploaded, friend count and mutual friends.
create or replace function profile_summary(p_username text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid; rel text; u text := lower(regexp_replace(trim(coalesce(p_username, '')), '^@', ''));
        mutual jsonb; r jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select id into t from profiles where username = u;
  if not found then raise exception 'User not found'; end if;

  rel := case
    when t = me then 'self'
    when exists (select 1 from friendships where status = 'accepted' and ((requester_id = me and addressee_id = t) or (requester_id = t and addressee_id = me))) then 'friends'
    when exists (select 1 from friendships where status = 'pending' and requester_id = me and addressee_id = t) then 'pending_out'
    when exists (select 1 from friendships where status = 'pending' and requester_id = t and addressee_id = me) then 'pending_in'
    else 'none' end;

  -- Friends you and they have in common (not shown on your own profile).
  select coalesce(jsonb_agg(p.username order by p.username), '[]'::jsonb) into mutual
  from profiles p
  where t <> me and p.id in (
    select case when requester_id = me then addressee_id else requester_id end from friendships where status = 'accepted' and me in (requester_id, addressee_id)
    intersect
    select case when requester_id = t then addressee_id else requester_id end from friendships where status = 'accepted' and t in (requester_id, addressee_id));

  select jsonb_build_object(
    'username', p.username,
    'tier', p.tier,
    'joined', x.created_at,
    'photo_count', (select count(*) from photos where owner_id = t),
    'friend_count', (select count(*) from friendships where status = 'accepted' and t in (requester_id, addressee_id)),
    'relationship', rel,
    'mutual', mutual
  ) into r from profiles p join auth.users x on x.id = p.id where p.id = t;
  return r;
end $$;

revoke execute on function profile_summary(text) from public, anon;
grant execute on function profile_summary(text) to authenticated;
notify pgrst, 'reload schema';
