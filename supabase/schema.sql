create table profiles (id uuid primary key references auth.users on delete cascade, email text unique not null, used_bytes bigint not null default 0);
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,email) values (new.id, lower(new.email)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table photos (id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade, object_key text not null, filename text, size_bytes bigint not null, created_at timestamptz default now());
create table photo_shares (photo_id uuid references photos on delete cascade, recipient_id uuid references profiles on delete cascade, primary key (photo_id, recipient_id));
-- Lifetime record: rows here are never deleted by unsharing, so remove + re-add cannot bypass the limit.
create table photo_recipient_history (photo_id uuid references photos on delete cascade, recipient_id uuid references profiles on delete cascade, primary key (photo_id, recipient_id));

alter table profiles enable row level security;
alter table photos enable row level security;
alter table photo_shares enable row level security;
alter table photo_recipient_history enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "own or shared photos" on photos for select using (
  owner_id = auth.uid() or exists (select 1 from photo_shares s where s.photo_id = photos.id and s.recipient_id = auth.uid()));
create policy "my incoming shares" on photo_shares for select using (recipient_id = auth.uid());
-- No client insert/update/delete policies: writes happen only via the server (service role) or the functions below.

create function share_photo(p_photo_id uuid, p_email text) returns void language plpgsql security definer set search_path=public as $$
declare r uuid;
begin
  perform 1 from photos where id = p_photo_id and owner_id = auth.uid() for update; -- row lock stops parallel bypass
  if not found then raise exception 'Not your photo'; end if;
  select id into r from profiles where email = lower(trim(p_email));
  if r is null then raise exception 'No user with that email'; end if;
  if r = auth.uid() then raise exception 'Cannot share with yourself'; end if;
  if not exists (select 1 from photo_recipient_history where photo_id = p_photo_id and recipient_id = r) then
    if (select count(*) from photo_recipient_history where photo_id = p_photo_id) >= 3 then
      raise exception 'Free limit reached: 3 recipients per photo'; end if;
    insert into photo_recipient_history values (p_photo_id, r);
  end if;
  insert into photo_shares values (p_photo_id, r) on conflict do nothing;
end $$;

create function unshare_photo(p_photo_id uuid, p_recipient uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from photo_shares where photo_id = p_photo_id and recipient_id = p_recipient
    and exists (select 1 from photos where id = p_photo_id and owner_id = auth.uid());
end $$;
