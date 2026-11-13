-- Run once in Supabase > SQL Editor, AFTER tiers.sql. Safe to re-run.
-- Adds "view & add" albums: every album gets a second link that lets people add photos, and the owner can also
-- tick "Can add" for any person already in the album. The original link stays view-only.
--
-- NOTE: this replaces join_album, albums_overview, add_photos_to_album and remove_photo_from_album. If you ever re-run
-- tiers.sql, albums.sql or usernames.sql, run this file again afterwards.

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'tier_share_limit') then
    raise exception 'Run tiers.sql first.';
  end if;
end $$;

alter table albums add column if not exists contribute_token text;
update albums set contribute_token = replace(gen_random_uuid()::text, '-', '') where contribute_token is null;
alter table albums alter column contribute_token set default replace(gen_random_uuid()::text, '-', '');
alter table albums alter column contribute_token set not null;
create unique index if not exists albums_contribute_token_key on albums (contribute_token);

-- can_add = this member may add photos. The view-only link adds people with false; the "view & add" link adds them with true.
alter table album_members add column if not exists can_add boolean not null default false;

-- Opening either link calls this. The view & add link also upgrades someone who joined earlier with the view-only link.
-- The view-only link never downgrades anyone.
create or replace function join_album(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a albums; m album_members; t text := trim(coalesce(p_token, '')); wants_add boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into a from albums where share_token = t or contribute_token = t for update;
  if not found then raise exception 'This album link is invalid or has been reset'; end if;
  wants_add := (a.contribute_token = t);
  if a.owner_id = auth.uid() then
    return jsonb_build_object('id', a.id, 'name', a.name, 'can_add', true);
  end if;
  select * into m from album_members where album_id = a.id and user_id = auth.uid();
  if not found then
    if (select count(*) from album_members where album_id = a.id) >= tier_share_limit(a.owner_id) then
      raise exception 'This album is full. Its owner has reached their plan''s share limit.';
    end if;
    insert into album_members (album_id, user_id, can_add) values (a.id, auth.uid(), wants_add) on conflict do nothing;
    return jsonb_build_object('id', a.id, 'name', a.name, 'can_add', wants_add);
  end if;
  if wants_add and not m.can_add then
    update album_members set can_add = true where album_id = a.id and user_id = auth.uid();
  end if;
  return jsonb_build_object('id', a.id, 'name', a.name, 'can_add', m.can_add or wants_add);
end $$;

-- Owner only: allow or stop a person adding photos.
create or replace function set_member_can_add(p_album uuid, p_user uuid, p_can boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from albums where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  update album_members set can_add = coalesce(p_can, false) where album_id = p_album and user_id = p_user;
end $$;

-- Owner only: replaces the view & add link. Anyone who already joined keeps their access.
create or replace function reset_contribute_link(p_album uuid) returns text language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '');
begin
  update albums set contribute_token = t where id = p_album and owner_id = auth.uid();
  if not found then raise exception 'Not your album'; end if;
  return t;
end $$;

-- The owner, or a member who is allowed to add, can add photos from their own library.
create or replace function add_photos_to_album(p_album uuid, p_photo_ids uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from albums where id = p_album and owner_id = auth.uid())
     and not exists (select 1 from album_members where album_id = p_album and user_id = auth.uid() and can_add) then
    raise exception 'You can''t add photos to this album';
  end if;
  insert into album_photos (album_id, photo_id)
    select p_album, id from photos where id = any(coalesce(p_photo_ids, '{}')) and owner_id = auth.uid()
    on conflict do nothing;
end $$;

-- The album owner can take any photo out; a member can take out their own.
create or replace function remove_photo_from_album(p_album uuid, p_photo uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from albums where id = p_album and owner_id = auth.uid())
     and not exists (select 1 from photos where id = p_photo and owner_id = auth.uid()) then
    raise exception 'Not allowed';
  end if;
  -- A photo that only exists in this album would be orphaned (invisible but still using space), so it must be deleted or saved instead.
  if exists (select 1 from photos where id = p_photo and in_library = false) then
    raise exception 'This photo only exists in this album. Delete it or save it to My Uploads instead.';
  end if;
  delete from album_photos where album_id = p_album and photo_id = p_photo;
end $$;

create or replace function albums_overview() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'is_owner', a.owner_id = auth.uid(),
    'owner_username', o.username,
    'created_at', a.created_at,
    'share_token', case when a.owner_id = auth.uid() then a.share_token end,
    'contribute_token', case when a.owner_id = auth.uid() then a.contribute_token end,
    'can_add', a.owner_id = auth.uid()
               or exists (select 1 from album_members mm where mm.album_id = a.id and mm.user_id = auth.uid() and mm.can_add),
    'photo_ids', coalesce((select jsonb_agg(ap.photo_id order by ap.added_at desc) from album_photos ap where ap.album_id = a.id), '[]'::jsonb),
    'member_count', (select count(*) from album_members m where m.album_id = a.id),
    'members', case when a.owner_id = auth.uid()
      then coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'can_add', m.can_add) order by m.joined_at)
                     from album_members m join profiles p on p.id = m.user_id where m.album_id = a.id), '[]'::jsonb)
      else '[]'::jsonb end
  ) order by a.created_at desc), '[]'::jsonb)
  from albums a
  join profiles o on o.id = a.owner_id
  where is_album_member(a.id);
$$;

revoke execute on function join_album(text), set_member_can_add(uuid, uuid, boolean), reset_contribute_link(uuid),
  add_photos_to_album(uuid, uuid[]), remove_photo_from_album(uuid, uuid), albums_overview() from public, anon;
grant execute on function join_album(text), set_member_can_add(uuid, uuid, boolean), reset_contribute_link(uuid),
  add_photos_to_album(uuid, uuid[]), remove_photo_from_album(uuid, uuid), albums_overview() to authenticated;

notify pgrst, 'reload schema';
