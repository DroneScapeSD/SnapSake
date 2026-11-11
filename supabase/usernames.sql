-- Run once in Supabase > SQL Editor, AFTER schema.sql, friends_and_tiers.sql and albums.sql. Safe to re-run.
-- Moves the app to @usernames: 3-20 characters, lowercase letters and numbers only.
-- Email stays on the account (it is still how Supabase Auth signs people in and recovers passwords) but is never shown to other users.
--
-- NOTE: if you ever re-run albums.sql or friends_and_tiers.sql, re-run this file afterwards,
-- because it replaces some of their functions (send_friend_request, friends_overview, albums_overview).

-- 1. Column ------------------------------------------------------------------------------------------------------
alter table profiles add column if not exists username text;

-- Give every existing account a username derived from its email (letters/numbers of the part before the @,
-- padded to 3 characters, with a number added if someone already has it). They are unique but not pretty.
do $$
declare r record; base text; cand text; n int;
begin
  for r in select id, email from profiles where username is null order by id loop
    base := regexp_replace(lower(split_part(r.email, '@', 1)), '[^a-z0-9]', '', 'g');
    if length(base) < 3 then base := rpad(base, 3, '0'); end if;
    base := left(base, 20);
    cand := base; n := 1;
    while exists (select 1 from profiles where username = cand) loop
      n := n + 1;
      cand := left(base, 20 - length(n::text)) || n::text;
    end loop;
    update profiles set username = cand where id = r.id;
  end loop;
end $$;

alter table profiles alter column username set not null;
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format check (username ~ '^[a-z0-9]{3,20}$');
create unique index if not exists profiles_username_key on profiles (username);

-- 2. Sign-up: the username travels in the auth metadata and is validated here, so it can't be skipped by calling Supabase directly.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare u text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '^@', ''));
begin
  if u !~ '^[a-z0-9]{3,20}$' then raise exception 'Username must be 3-20 letters or numbers'; end if;
  insert into profiles(id, email, username) values (new.id, lower(new.email), u);
  return new;
end $$;

-- Lets the sign-up form say "taken" before submitting. Returns only true/false, so it exposes nothing else. Callable while signed out.
create or replace function username_available(p_username text) returns boolean language sql stable security definer set search_path=public as $$
  select not exists (select 1 from profiles where username = lower(regexp_replace(trim(coalesce(p_username, '')), '^@', '')));
$$;
revoke execute on function username_available(text) from public;
grant execute on function username_available(text) to anon, authenticated;

-- 3. Friends: look people up by username instead of email --------------------------------------------------------
drop function if exists send_friend_request(text);
create function send_friend_request(p_username text) returns void language plpgsql security definer set search_path=public as $$
declare r uuid; f friendships; u text := lower(regexp_replace(trim(coalesce(p_username, '')), '^@', ''));
begin
  select id into r from profiles where username = u;
  if r is null then raise exception 'No user with that username'; end if;
  if r = auth.uid() then raise exception 'You cannot add yourself'; end if;
  select * into f from friendships
    where (requester_id = auth.uid() and addressee_id = r) or (requester_id = r and addressee_id = auth.uid());
  if found then
    if f.status = 'accepted' then raise exception 'You are already friends'; end if;
    if f.requester_id = auth.uid() then raise exception 'Request already sent'; end if;
    update friendships set status = 'accepted' where id = f.id; -- they already asked you, so this accepts it
    return;
  end if;
  insert into friendships (requester_id, addressee_id) values (auth.uid(), r);
end $$;

create or replace function friends_overview() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'status', f.status,
    'direction', case when f.requester_id = auth.uid() then 'out' else 'in' end,
    'user_id', p.id,
    'username', p.username,
    'created_at', f.created_at
  ) order by f.created_at desc), '[]'::jsonb)
  from friendships f
  join profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid();
$$;

-- 4. Photo sharing ----------------------------------------------------------------------------------------------
drop function if exists share_photo(uuid, text);
create function share_photo(p_photo_id uuid, p_username text) returns void language plpgsql security definer set search_path=public as $$
declare r uuid; u text := lower(regexp_replace(trim(coalesce(p_username, '')), '^@', ''));
begin
  perform 1 from photos where id = p_photo_id and owner_id = auth.uid() for update; -- row lock stops parallel bypass
  if not found then raise exception 'Not your photo'; end if;
  select id into r from profiles where username = u;
  if r is null then raise exception 'No user with that username'; end if;
  if r = auth.uid() then raise exception 'Cannot share with yourself'; end if;
  if not exists (select 1 from photo_recipient_history where photo_id = p_photo_id and recipient_id = r) then
    if (select count(*) from photo_recipient_history where photo_id = p_photo_id) >= 3 then
      raise exception 'Free limit reached: 3 recipients per photo'; end if;
    insert into photo_recipient_history values (p_photo_id, r);
  end if;
  insert into photo_shares values (p_photo_id, r) on conflict do nothing;
end $$;

-- The share panel's data: who a photo is shared with, and how many lifetime recipient slots are used.
-- (This function was not in the earlier SQL files; it is defined here so recipients come back as usernames.)
drop function if exists share_info(uuid);
create function share_info(p_photo_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select case when exists (select 1 from photos where id = p_photo_id and owner_id = auth.uid()) then jsonb_build_object(
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username) order by p.username)
                            from photo_shares s join profiles p on p.id = s.recipient_id where s.photo_id = p_photo_id), '[]'::jsonb),
    'used', (select count(*) from photo_recipient_history h where h.photo_id = p_photo_id)
  ) end;
$$;

-- 5. Albums -----------------------------------------------------------------------------------------------------
create or replace function albums_overview() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'is_owner', a.owner_id = auth.uid(),
    'owner_username', o.username,
    'created_at', a.created_at,
    'share_token', case when a.owner_id = auth.uid() then a.share_token end,
    'photo_ids', coalesce((select jsonb_agg(ap.photo_id order by ap.added_at desc) from album_photos ap where ap.album_id = a.id), '[]'::jsonb),
    'member_count', (select count(*) from album_members m where m.album_id = a.id),
    'members', case when a.owner_id = auth.uid()
      then coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username) order by m.joined_at)
                     from album_members m join profiles p on p.id = m.user_id where m.album_id = a.id), '[]'::jsonb)
      else '[]'::jsonb end
  ) order by a.created_at desc), '[]'::jsonb)
  from albums a
  join profiles o on o.id = a.owner_id
  where is_album_member(a.id);
$$;

-- 6. Permissions: signed-in users only (the dropped/recreated functions lost their earlier grants) ------------------
revoke execute on function send_friend_request(text), share_photo(uuid, text), share_info(uuid) from public, anon;
grant execute on function send_friend_request(text), share_photo(uuid, text), share_info(uuid) to authenticated;

notify pgrst, 'reload schema';
