-- Run once in Supabase > SQL Editor, AFTER schema.sql, friends_and_tiers.sql, albums.sql and usernames.sql. Safe to re-run.
-- Adds the four plans (free / plus / pro / admin), per-user storage limits, share limits that follow the plan,
-- and the numbers behind the admin dashboard.
--
-- NOTE: this replaces share_photo, share_info, add_album_member and join_album. If you ever re-run usernames.sql or
-- albums.sql, run this file again afterwards so the plan limits stay in force.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'username') then
    raise exception 'Run usernames.sql first.';
  end if;
end $$;

-- 1. Columns ------------------------------------------------------------------------------------------------------
update profiles set tier = 'free' where tier not in ('free', 'plus', 'pro', 'admin');
alter table profiles drop constraint if exists profiles_tier_check;
alter table profiles add constraint profiles_tier_check check (tier in ('free', 'plus', 'pro', 'admin'));

-- A storage limit set by hand from the admin dashboard, in bytes. null = use the plan's own limit.
alter table profiles add column if not exists quota_bytes bigint;
alter table profiles drop constraint if exists profiles_quota_check;
alter table profiles add constraint profiles_quota_check check (quota_bytes is null or quota_bytes >= 0);

-- Left over from a removed "request an upgrade" feature; safe if that column was never added.
alter table profiles drop column if exists requested_tier;

-- Your account gets the Admin plan.
update profiles set tier = 'admin' where username = 'slater';
-- Clients can only READ their own profile row (RLS), so nobody can raise their own tier or limit from the browser.

-- 2. Share limits per plan. Keep in sync with TIERS in src/lib/limits.ts. ----------------------------------------------
create or replace function tier_share_limit(p_uid uuid) returns int language sql stable security definer set search_path = public as $$
  select case (select tier from profiles where id = p_uid) when 'plus' then 6 when 'pro' then 10 when 'admin' then 10 else 2 end;
$$;
revoke execute on function tier_share_limit(uuid) from public, anon, authenticated;

-- Photos: a lifetime limit of distinct recipients per photo, based on the OWNER's plan.
create or replace function share_photo(p_photo_id uuid, p_username text) returns void language plpgsql security definer set search_path = public as $$
declare r uuid; lim int := tier_share_limit(auth.uid()); u text := lower(regexp_replace(trim(coalesce(p_username, '')), '^@', ''));
begin
  perform 1 from photos where id = p_photo_id and owner_id = auth.uid() for update; -- row lock stops parallel bypass
  if not found then raise exception 'Not your photo'; end if;
  select id into r from profiles where username = u;
  if r is null then raise exception 'No user with that username'; end if;
  if r = auth.uid() then raise exception 'Cannot share with yourself'; end if;
  if not exists (select 1 from photo_recipient_history where photo_id = p_photo_id and recipient_id = r) then
    if (select count(*) from photo_recipient_history where photo_id = p_photo_id) >= lim then
      raise exception 'Share limit reached: your plan allows % recipients per photo', lim; end if;
    insert into photo_recipient_history values (p_photo_id, r);
  end if;
  insert into photo_shares values (p_photo_id, r) on conflict do nothing;
end $$;

-- Same as before, plus the limit so the share panel always shows the real number.
create or replace function share_info(p_photo_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from photos where id = p_photo_id and owner_id = auth.uid()) then jsonb_build_object(
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username) order by p.username)
                            from photo_shares s join profiles p on p.id = s.recipient_id where s.photo_id = p_photo_id), '[]'::jsonb),
    'used', (select count(*) from photo_recipient_history h where h.photo_id = p_photo_id),
    'limit', tier_share_limit(auth.uid())
  ) end;
$$;

-- Albums: the number of people who can be in an album (friends added + people who joined by link) is capped by the OWNER's plan.
create or replace function add_album_member(p_album uuid, p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare lim int := tier_share_limit(auth.uid());
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid() for update;
  if not found then raise exception 'Not your album'; end if;
  if not exists (select 1 from friendships f where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = auth.uid()))) then
    raise exception 'You can only share albums with friends';
  end if;
  if not exists (select 1 from album_members where album_id = p_album and user_id = p_user)
     and (select count(*) from album_members where album_id = p_album) >= lim then
    raise exception 'Share limit reached: your plan allows % people per album', lim;
  end if;
  insert into album_members (album_id, user_id) values (p_album, p_user) on conflict do nothing;
end $$;

create or replace function join_album(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a albums;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into a from albums where share_token = trim(coalesce(p_token, '')) for update;
  if not found then raise exception 'This album link is invalid or has been reset'; end if;
  if a.owner_id <> auth.uid() and not exists (select 1 from album_members where album_id = a.id and user_id = auth.uid()) then
    if (select count(*) from album_members where album_id = a.id) >= tier_share_limit(a.owner_id) then
      raise exception 'This album is full. Its owner has reached their plan''s share limit.';
    end if;
    insert into album_members (album_id, user_id) values (a.id, auth.uid()) on conflict do nothing;
  end if;
  return jsonb_build_object('id', a.id, 'name', a.name);
end $$;

-- 3. Admin dashboard data: one row per user. Only the server (service role) can call this, never a browser. ----------
create or replace function admin_user_stats() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', p.email,
    'tier', p.tier,
    'created_at', u.created_at,
    'used_bytes', p.used_bytes,
    'quota_bytes', p.quota_bytes,
    'friend_count', (select count(*) from friendships f where f.status = 'accepted' and (f.requester_id = p.id or f.addressee_id = p.id))
  ) order by u.created_at desc), '[]'::jsonb)
  from profiles p join auth.users u on u.id = p.id;
$$;
revoke execute on function admin_user_stats() from public, anon, authenticated;
grant execute on function admin_user_stats() to service_role;

-- 4. Permissions for the replaced functions (signed-in users only) -----------------------------------------------------
revoke execute on function share_photo(uuid, text), share_info(uuid), add_album_member(uuid, uuid), join_album(text) from public, anon;
grant execute on function share_photo(uuid, text), share_info(uuid), add_album_member(uuid, uuid), join_album(text) to authenticated;

notify pgrst, 'reload schema';
