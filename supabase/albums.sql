-- Run once in Supabase > SQL Editor (after schema.sql and friends_and_tiers.sql). Safe to re-run.
-- Adds albums: a named set of your photos that people can join through a link.

-- Photos uploaded straight into an album are stored once and have in_library = false, so they don't show in My Uploads.
-- "Save to My Uploads" flips it to true. Photos from your library keep in_library = true when added to an album.
alter table photos add column if not exists in_library boolean not null default true;

create table if not exists albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  -- The secret in the share link. 32 hex chars (122 random bits). "Reset link" replaces it.
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create table if not exists album_photos (
  album_id uuid not null references albums on delete cascade,
  photo_id uuid not null references photos on delete cascade, -- deleting a photo removes it from every album
  added_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);
create table if not exists album_members (
  album_id uuid not null references albums on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (album_id, user_id)
);
create index if not exists album_photos_photo_idx on album_photos (photo_id);
create index if not exists album_members_user_idx on album_members (user_id);

alter table albums enable row level security;
alter table album_photos enable row level security;
alter table album_members enable row level security;

-- Policy helpers. They run as the table owner so the policies below can't recurse into each other.
create or replace function is_album_member(p_album uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from albums a where a.id = p_album and a.owner_id = auth.uid())
      or exists (select 1 from album_members m where m.album_id = p_album and m.user_id = auth.uid());
$$;
create or replace function photo_in_my_album(p_photo uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from album_photos ap where ap.photo_id = p_photo and is_album_member(ap.album_id));
$$;

drop policy if exists "my albums" on albums;
create policy "my albums" on albums for select using (is_album_member(id));
drop policy if exists "photos of my albums" on album_photos;
create policy "photos of my albums" on album_photos for select using (is_album_member(album_id));
drop policy if exists "my album memberships" on album_members;
create policy "my album memberships" on album_members for select using (user_id = auth.uid());
-- Album members may view (and so download) the photos in their albums. This adds to the existing "own or shared photos" policy.
drop policy if exists "photos in my albums" on photos;
create policy "photos in my albums" on photos for select using (photo_in_my_album(id));
-- No client insert/update/delete policies: all writes go through the functions below.

create or replace function create_album(p_name text, p_photo_ids uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid; n text := left(trim(coalesce(p_name, '')), 60);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if n = '' then n := 'Untitled album'; end if;
  insert into albums (owner_id, name) values (auth.uid(), n) returning id into v;
  insert into album_photos (album_id, photo_id)
    select v, id from photos where id = any(coalesce(p_photo_ids, '{}')) and owner_id = auth.uid()
    on conflict do nothing;
  return v;
end $$;

create or replace function add_photos_to_album(p_album uuid, p_photo_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  insert into album_photos (album_id, photo_id)
    select p_album, id from photos where id = any(coalesce(p_photo_ids, '{}')) and owner_id = auth.uid()
    on conflict do nothing;
end $$;

create or replace function remove_photo_from_album(p_album uuid, p_photo uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  -- A photo that only exists in this album would be orphaned (invisible but still using space), so it must be deleted or saved instead.
  if exists (select 1 from photos where id = p_photo and in_library = false) then
    raise exception 'This photo only exists in this album. Delete it or save it to My Uploads instead.';
  end if;
  delete from album_photos where album_id = p_album and photo_id = p_photo;
end $$;

create or replace function rename_album(p_album uuid, p_name text) returns void language plpgsql security definer set search_path=public as $$
declare n text := left(trim(coalesce(p_name, '')), 60);
begin
  if n = '' then raise exception 'Name cannot be empty'; end if;
  update albums set name = n where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
end $$;

-- Deletes the album only; the photos stay in their owners' libraries.
create or replace function delete_album(p_album uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  -- The app deletes albums through /api/delete-album, which also removes the stored files of photos uploaded directly to the album.
  if exists (select 1 from album_photos ap join photos p on p.id = ap.photo_id where ap.album_id = p_album and p.in_library = false) then
    raise exception 'This album has photos uploaded directly to it. Delete the album from the app so they are cleaned up.';
  end if;
  delete from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
end $$;

-- Share with a friend from the checklist. Friends only; people who join through the link don't need to be friends.
create or replace function add_album_member(p_album uuid, p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  if not exists (select 1 from friendships f where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = auth.uid()))) then
    raise exception 'You can only share albums with friends';
  end if;
  insert into album_members (album_id, user_id) values (p_album, p_user) on conflict do nothing;
end $$;

-- Turns a photo that was uploaded straight into an album into a normal My Uploads photo (it stays in the album too).
create or replace function move_to_library(p_photo uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update photos set in_library = true where id = p_photo and owner_id = auth.uid();
  if not found then raise exception 'Photo not found'; end if;
end $$;

-- Opening a share link calls this. Safe to call repeatedly; the owner and existing members are left alone.
create or replace function join_album(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a albums;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into a from albums where share_token = trim(coalesce(p_token, ''));
  if not found then raise exception 'This album link is invalid or has been reset'; end if;
  if a.owner_id <> auth.uid() then
    insert into album_members (album_id, user_id) values (a.id, auth.uid()) on conflict do nothing;
  end if;
  return jsonb_build_object('id', a.id, 'name', a.name);
end $$;

create or replace function leave_album(p_album uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from album_members where album_id = p_album and user_id = auth.uid();
end $$;

create or replace function remove_album_member(p_album uuid, p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  delete from album_members where album_id = p_album and user_id = p_user;
end $$;

-- Invalidates the old link so nobody new can join with it. Current members keep access.
create or replace function reset_album_link(p_album uuid) returns text language plpgsql security definer set search_path=public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  update albums set share_token = t where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  return t;
end $$;

-- Everything the Albums tab needs in one call. Only the owner receives the share token and the member list.
create or replace function albums_overview() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'is_owner', a.owner_id = auth.uid(),
    'owner_email', o.email,
    'created_at', a.created_at,
    'share_token', case when a.owner_id = auth.uid() then a.share_token end,
    'photo_ids', coalesce((select jsonb_agg(ap.photo_id order by ap.added_at desc) from album_photos ap where ap.album_id = a.id), '[]'::jsonb),
    'member_count', (select count(*) from album_members m where m.album_id = a.id),
    'members', case when a.owner_id = auth.uid()
      then coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', p.email) order by m.joined_at)
                     from album_members m join profiles p on p.id = m.user_id where m.album_id = a.id), '[]'::jsonb)
      else '[]'::jsonb end
  ) order by a.created_at desc), '[]'::jsonb)
  from albums a
  join profiles o on o.id = a.owner_id
  where is_album_member(a.id);
$$;

-- Only signed-in users may call these (auth.uid() is null for anon).
revoke execute on function create_album(text, uuid[]), add_photos_to_album(uuid, uuid[]), remove_photo_from_album(uuid, uuid),
  rename_album(uuid, text), delete_album(uuid), join_album(text), leave_album(uuid), remove_album_member(uuid, uuid),
  reset_album_link(uuid), albums_overview(), add_album_member(uuid, uuid), move_to_library(uuid) from public, anon;
grant execute on function create_album(text, uuid[]), add_photos_to_album(uuid, uuid[]), remove_photo_from_album(uuid, uuid),
  rename_album(uuid, text), delete_album(uuid), join_album(text), leave_album(uuid), remove_album_member(uuid, uuid),
  reset_album_link(uuid), albums_overview(), add_album_member(uuid, uuid), move_to_library(uuid) to authenticated;

notify pgrst, 'reload schema';
