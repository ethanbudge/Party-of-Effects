-- ============================================================================
-- Party of Effects — groups
-- ============================================================================
-- Run this AFTER schema.sql. Safe to re-run.
--
-- Adds multi-group support: a person can belong to several groups, sees one at
-- a time, and can also work alone with a private library.
--
-- SECURITY MODEL
-- --------------
-- Everything hangs off one question — "is this person a member of that group?"
-- — answered by public.is_group_member(). It is SECURITY DEFINER for a
-- specific reason: an RLS policy on group_members that itself queries
-- group_members recurses infinitely and Postgres aborts with "infinite
-- recursion detected in policy". Running the check as the function owner
-- bypasses RLS on that one lookup and breaks the cycle.
--
-- Group passwords are never stored, never sent to a browser, and never
-- verified in one. They live as PBKDF2 hashes in a table with RLS enabled and
-- zero policies — total denial for the anon key — reachable only by the API's
-- service-role key, which compares them in constant time.
--
-- Scoping rule used throughout:
--   group_id IS NULL  -> private, visible only to created_by (solo mode)
--   group_id SET      -> visible to every member of that group
-- ============================================================================


-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Case-folded name, unique. Joining is by name + password, so two groups
  -- called "Thursday" and "thursday" would be ambiguous at the door.
  name_key   text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint groups_name_len check (char_length(name) between 2 and 60)
);

alter table public.groups enable row level security;


-- ---------------------------------------------------------------------------
-- group_secrets — password hashes. SERVICE ROLE ONLY.
-- ---------------------------------------------------------------------------
-- Separate from `groups` so that members reading their own group's name and id
-- can never also read its password hash.
create table if not exists public.group_secrets (
  group_id      uuid primary key references public.groups(id) on delete cascade,
  -- Format: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

-- RLS on with no policies => nothing reachable by anon or authenticated.
alter table public.group_secrets enable row level security;
alter table public.group_secrets force row level security;


-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.group_members enable row level security;


-- ---------------------------------------------------------------------------
-- Membership check — the hinge everything else turns on
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it reads group_members with the function owner's rights,
-- bypassing RLS on that table. Without this, the SELECT policy on
-- group_members would have to query group_members, which recurses.
--
-- `set search_path = ''` is a hardening requirement for SECURITY DEFINER
-- functions: it stops a caller shadowing `group_members` with their own table
-- earlier in the search path. Everything below is therefore schema-qualified.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select gid is not null and exists (
    select 1
    from public.group_members m
    where m.group_id = gid
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;


/** True when the caller owns the group. Same recursion reasoning. */
create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select gid is not null and exists (
    select 1
    from public.group_members m
    where m.group_id = gid
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_group_owner(uuid) from public;
grant execute on function public.is_group_owner(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Policies for groups / group_members
-- ---------------------------------------------------------------------------
-- Deliberately no "browse all groups" policy: you can only see a group you
-- already belong to. That stops the group list being enumerated, which matters
-- because joining needs only a name and a password.

drop policy if exists "groups readable by members" on public.groups;
create policy "groups readable by members"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups renamable by owner" on public.groups;
create policy "groups renamable by owner"
  on public.groups for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id));

-- Creation and deletion go through the API, which also writes the password
-- hash and the owner membership row in the same operation. Letting a browser
-- insert directly would allow a group with no secret and no owner.

drop policy if exists "memberships readable by group" on public.group_members;
create policy "memberships readable by group"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- Leaving is the one membership change a browser may make on its own.
drop policy if exists "members may leave" on public.group_members;
create policy "members may leave"
  on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------------
-- Scope existing content to groups
-- ---------------------------------------------------------------------------
alter table public.scenes  add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.effects add column if not exists group_id uuid references public.groups(id) on delete cascade;
alter table public.folders add column if not exists group_id uuid references public.groups(id) on delete cascade;

create index if not exists scenes_group_idx  on public.scenes  (group_id);
create index if not exists effects_group_idx on public.effects (group_id);
create index if not exists folders_group_idx on public.folders (owner_id, group_id, kind, position);

alter table public.user_settings
  add column if not exists active_group_id uuid references public.groups(id) on delete set null;


-- ---------------------------------------------------------------------------
-- Scenes — group library, or private when group_id is null
-- ---------------------------------------------------------------------------
drop policy if exists "scenes readable"   on public.scenes;
drop policy if exists "scenes insertable" on public.scenes;
drop policy if exists "scenes updatable"  on public.scenes;
drop policy if exists "scenes deletable"  on public.scenes;

create policy "scenes readable"
  on public.scenes for select to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  );

create policy "scenes insertable"
  on public.scenes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (group_id is null or public.is_group_member(group_id))
  );

-- The `with check` matters as much as the `using`: without it a member could
-- move a scene into a group they don't belong to, or hand it to someone else.
create policy "scenes updatable"
  on public.scenes for update to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  )
  with check (group_id is null or public.is_group_member(group_id));

create policy "scenes deletable"
  on public.scenes for delete to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  );


-- ---------------------------------------------------------------------------
-- Effects — same rules
-- ---------------------------------------------------------------------------
drop policy if exists "effects readable"   on public.effects;
drop policy if exists "effects insertable" on public.effects;
drop policy if exists "effects updatable"  on public.effects;
drop policy if exists "effects deletable"  on public.effects;

create policy "effects readable"
  on public.effects for select to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  );

create policy "effects insertable"
  on public.effects for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (group_id is null or public.is_group_member(group_id))
  );

create policy "effects updatable"
  on public.effects for update to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  )
  with check (group_id is null or public.is_group_member(group_id));

create policy "effects deletable"
  on public.effects for delete to authenticated
  using (
    case
      when group_id is null then created_by = (select auth.uid())
      else public.is_group_member(group_id)
    end
  );


-- ---------------------------------------------------------------------------
-- Folders stay private to their owner, now also scoped per group
-- ---------------------------------------------------------------------------
drop policy if exists "folders owned" on public.folders;
create policy "folders owned"
  on public.folders for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (group_id is null or public.is_group_member(group_id))
  );


-- ---------------------------------------------------------------------------
-- Sound files, scoped by their path
-- ---------------------------------------------------------------------------
-- Uploads go to  <group-uuid>/<file>  for a group, or  u_<user-uuid>/<file>
-- when working solo, so a path carries its own access rule.
create or replace function public.path_group_id(path text)
returns uuid
language plpgsql
immutable
as $$
declare
  seg text;
begin
  seg := split_part(path, '/', 1);
  -- Postgres has no try_cast; check the shape before casting so a non-uuid
  -- prefix returns null instead of raising and failing the whole policy.
  if seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return seg::uuid;
  end if;
  return null;
end;
$$;

drop policy if exists "sounds readable by group"   on storage.objects;
drop policy if exists "sounds uploadable by group" on storage.objects;
drop policy if exists "sounds deletable by group"  on storage.objects;

-- `dndlights/` is the preset pack imported from the public dndlights GitHub
-- release. Those files are already public on the internet, so keeping them
-- readable by any signed-in user avoids re-uploading ~95 MB per group for no
-- privacy gain. Everything a person uploads themselves is scoped properly.
create policy "sounds readable by group"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'effect-sounds'
    and (
      split_part(name, '/', 1) = 'dndlights'
      or split_part(name, '/', 1) = 'u_' || (select auth.uid())::text
      or public.is_group_member(public.path_group_id(name))
    )
  );

create policy "sounds uploadable by group"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'effect-sounds'
    and (
      split_part(name, '/', 1) = 'u_' || (select auth.uid())::text
      or public.is_group_member(public.path_group_id(name))
    )
  );

create policy "sounds deletable by group"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'effect-sounds'
    and (
      split_part(name, '/', 1) = 'u_' || (select auth.uid())::text
      or public.is_group_member(public.path_group_id(name))
    )
  );


-- ---------------------------------------------------------------------------
-- Realtime — one channel per group, members only
-- ---------------------------------------------------------------------------
-- Channel topics are 'group:<uuid>'. Parsing the id out of the topic lets the
-- same membership check gate the live channel, so a person who is not in the
-- group cannot even subscribe to hear what it is doing.
create or replace function public.topic_group_id(topic text)
returns uuid
language plpgsql
immutable
as $$
begin
  if topic like 'group:%' then
    return public.path_group_id(substring(topic from 7));
  end if;
  return null;
end;
$$;

drop policy if exists "authenticated realtime access" on realtime.messages;
drop policy if exists "authenticated realtime send"   on realtime.messages;

create policy "group realtime receive"
  on realtime.messages for select to authenticated
  using (public.is_group_member(public.topic_group_id(realtime.topic())));

create policy "group realtime send"
  on realtime.messages for insert to authenticated
  with check (public.is_group_member(public.topic_group_id(realtime.topic())));


-- ---------------------------------------------------------------------------
-- Join throttling
-- ---------------------------------------------------------------------------
-- Joining needs only a name and a password, so without a limit the door could
-- be brute-forced. The API records every failed attempt here and refuses once
-- they pile up. Service-role only.
create table if not exists public.group_join_attempts (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  name_key     text,
  succeeded    boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists join_attempts_user_idx
  on public.group_join_attempts (user_id, attempted_at desc);

alter table public.group_join_attempts enable row level security;
alter table public.group_join_attempts force row level security;


-- ---------------------------------------------------------------------------
-- Migration: move the existing shared library into your first group
-- ---------------------------------------------------------------------------
-- Everything created before groups existed has group_id null, which now means
-- "private to created_by" — and the seeded rows have created_by null, so they
-- would belong to nobody and vanish.
--
-- Run this ONCE, after creating your first group in the app, to adopt them.
-- Put your group's name in the line marked below. Safe to re-run: it only
-- touches rows that are still unassigned and ownerless.

do $$
declare
  gid uuid;
  target_name constant text := 'YOUR_GROUP_NAME_HERE';   -- <<< change this
  n_scenes int;
  n_effects int;
begin
  select id into gid from public.groups where name_key = lower(trim(target_name));

  if gid is null then
    raise notice 'No group named "%" — create it in the app first, then re-run.', target_name;
    return;
  end if;

  update public.scenes set group_id = gid
  where group_id is null and created_by is null;
  get diagnostics n_scenes = row_count;

  update public.effects set group_id = gid
  where group_id is null and created_by is null;
  get diagnostics n_effects = row_count;

  raise notice 'Adopted % scenes and % effects into "%".', n_scenes, n_effects, target_name;
end $$;
