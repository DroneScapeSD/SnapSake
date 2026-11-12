-- Run once in Supabase > SQL Editor, AFTER tiers.sql. Safe to re-run.
-- Free upgrades by invite: 5 invited friends -> Plus, 15 -> Pro (keep in sync with INVITES in src/lib/limits.ts).
-- A friend counts once they signed up through your invite link and have uploaded at least one photo.

alter table profiles add column if not exists referred_by uuid references profiles(id) on delete set null;
create index if not exists profiles_referred_by_idx on profiles (referred_by);

-- Called by a new user's browser after signing up with ?ref=<username>. Only works within a day of creating the account.
create or replace function claim_referral(p_username text) returns void language plpgsql security definer set search_path = public as $$
declare r uuid; u text := lower(regexp_replace(trim(coalesce(p_username, '')), '^@', ''));
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and created_at > now() - interval '1 day') then return; end if;
  select id into r from profiles where username = u;
  if r is null or r = auth.uid() then return; end if;
  if exists (select 1 from profiles where id = r and referred_by = auth.uid()) then return; end if; -- no invite loops
  update profiles set referred_by = r where id = auth.uid() and referred_by is null;
end $$;

-- Counts the caller's qualifying invites and upgrades their plan if they reached a target. Never downgrades.
create or replace function redeem_invites() returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; t text; nt text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select count(*) into n from profiles c
   where c.referred_by = auth.uid()
     and exists (select 1 from photos ph where ph.owner_id = c.id)
     -- EMAIL CONFIRMATION: once you turn on "Confirm email" in Supabase (Authentication > Providers > Email),
     -- un-comment the next line so only friends with a confirmed email count.
     -- and exists (select 1 from auth.users u where u.id = c.id and u.email_confirmed_at is not null)
  ;
  select tier into t from profiles where id = auth.uid();
  nt := t;
  if t = 'free' and n >= 5 then nt := 'plus'; end if;
  if t in ('free', 'plus') and n >= 15 then nt := 'pro'; end if;
  if nt <> t then update profiles set tier = nt where id = auth.uid(); end if;
  return jsonb_build_object('count', n, 'tier', nt);
end $$;

revoke execute on function claim_referral(text), redeem_invites() from public, anon;
grant execute on function claim_referral(text), redeem_invites() to authenticated;
notify pgrst, 'reload schema';
