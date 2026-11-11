-- Run once in Supabase > SQL Editor (after schema.sql). Adds the friends list and subscription tier used by the sidebar.

-- Subscription tier (shown on the Account page). Everyone starts on 'free'.
alter table profiles add column if not exists tier text not null default 'free';

-- Friendships: one row per pair. 'pending' until the addressee accepts; declining/cancelling/unfriending deletes the row.
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles on delete cascade,
  addressee_id uuid not null references profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One row per pair, regardless of who asked first.
create unique index if not exists friendships_pair_idx on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table friendships enable row level security;
drop policy if exists "my friendships" on friendships;
create policy "my friendships" on friendships for select using (requester_id = auth.uid() or addressee_id = auth.uid());
-- No client insert/update/delete policies: writes happen only through the functions below.

create or replace function send_friend_request(p_email text) returns void language plpgsql security definer set search_path=public as $$
declare r uuid; f friendships;
begin
  select id into r from profiles where email = lower(trim(p_email));
  if r is null then raise exception 'No user with that email'; end if;
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

create or replace function respond_friend_request(p_id uuid, p_accept boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_accept then
    update friendships set status = 'accepted' where id = p_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from friendships where id = p_id and addressee_id = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'Request not found'; end if;
end $$;

-- Cancel a request you sent, or remove an existing friend.
create or replace function remove_friendship(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from friendships where id = p_id and (requester_id = auth.uid() or addressee_id = auth.uid());
end $$;

-- Everything the Friends page needs in one call, with the other person's email attached.
create or replace function friends_overview() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'status', f.status,
    'direction', case when f.requester_id = auth.uid() then 'out' else 'in' end,
    'user_id', p.id,
    'email', p.email,
    'created_at', f.created_at
  ) order by f.created_at desc), '[]'::jsonb)
  from friendships f
  join profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid();
$$;
