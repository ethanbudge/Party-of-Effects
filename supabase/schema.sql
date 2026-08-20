-- ============================================================================
-- Party of Effects — database schema
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
--
-- SECURITY MODEL IN ONE PARAGRAPH
-- --------------------------------
-- `user_credentials` holds the AES-256-GCM ciphertext of each person's LIFX
-- personal access token and Spotify refresh token. It has RLS ENABLED and
-- ZERO POLICIES, which in Postgres means "deny everything". No browser client
-- can read it, not even the row's owner, because the browser holds the anon
-- key. Only the API server, which holds the service-role key, can touch it —
-- and the API only ever decrypts a row when that same user's own JWT is
-- attached to the request. Friend A's session can never trigger a decrypt of
-- friend B's tokens.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, for display names and presence
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Adventurer',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by group" on public.profiles;
create policy "profiles readable by group"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles updatable by owner" on public.profiles;
create policy "profiles updatable by owner"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- user_credentials — encrypted secrets. SERVICE ROLE ONLY.
-- ---------------------------------------------------------------------------
create table if not exists public.user_credentials (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  -- AES-256-GCM, base64. Format handled entirely by server/src/crypto.ts
  lifx_token_ct          text,
  spotify_refresh_ct     text,
  spotify_scope          text,
  spotify_expires_at     timestamptz,
  -- Cached short-lived access token so we don't hammer Spotify's refresh endpoint
  spotify_access_ct      text,
  updated_at             timestamptz not null default now()
);

-- RLS on, no policies => total lockout for anon + authenticated roles.
-- The service-role key bypasses RLS, which is exactly (and only) how the
-- API server reaches this table.
alter table public.user_credentials enable row level security;
alter table public.user_credentials force row level security;


-- ---------------------------------------------------------------------------
-- scenes — shared library. Anyone in the group can create / edit / delete.
-- ---------------------------------------------------------------------------
create table if not exists public.scenes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  hex          text not null default '#CC7820',
  brightness   real not null default 0.4 check (brightness >= 0 and brightness <= 1),
  playlist_uri text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.scenes enable row level security;

drop policy if exists "scenes readable" on public.scenes;
create policy "scenes readable"
  on public.scenes for select to authenticated using (true);

drop policy if exists "scenes insertable" on public.scenes;
create policy "scenes insertable"
  on public.scenes for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "scenes updatable" on public.scenes;
create policy "scenes updatable"
  on public.scenes for update to authenticated using (true) with check (true);

drop policy if exists "scenes deletable" on public.scenes;
create policy "scenes deletable"
  on public.scenes for delete to authenticated using (true);


-- ---------------------------------------------------------------------------
-- effects — shared library. `frames` is the light timeline.
-- ---------------------------------------------------------------------------
-- frames shape:
--   [{ "t_ms": 0, "hex": "#5C0808", "brightness": 0.22, "fade_ms": 400 }, ...]
-- t_ms  = when this frame fires, relative to sound start
-- fade_ms = LIFX transition duration into this colour
-- ---------------------------------------------------------------------------
create table if not exists public.effects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sound_path    text,                       -- path inside the `effect-sounds` bucket
  duration_ms   integer not null default 0,
  frames        jsonb not null default '[]'::jsonb,
  revert_ms     integer not null default 2000,  -- fade back to active scene
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.effects enable row level security;

drop policy if exists "effects readable" on public.effects;
create policy "effects readable"
  on public.effects for select to authenticated using (true);

drop policy if exists "effects insertable" on public.effects;
create policy "effects insertable"
  on public.effects for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "effects updatable" on public.effects;
create policy "effects updatable"
  on public.effects for update to authenticated using (true) with check (true);

drop policy if exists "effects deletable" on public.effects;
create policy "effects deletable"
  on public.effects for delete to authenticated using (true);


-- ---------------------------------------------------------------------------
-- folders — PER PERSON. Your folder tree is yours alone.
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('scene', 'effect')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists folders_owner_kind_idx on public.folders (owner_id, kind, position);

alter table public.folders enable row level security;

drop policy if exists "folders owned" on public.folders;
create policy "folders owned"
  on public.folders for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- ---------------------------------------------------------------------------
-- folder_items — PER PERSON placement of a shared scene/effect into a folder
-- ---------------------------------------------------------------------------
create table if not exists public.folder_items (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  kind      text not null check (kind in ('scene', 'effect')),
  item_id   uuid not null,          -- -> scenes.id or effects.id
  position  integer not null default 0,
  unique (owner_id, folder_id, kind, item_id)
);

create index if not exists folder_items_owner_idx on public.folder_items (owner_id, kind);

alter table public.folder_items enable row level security;

drop policy if exists "folder items owned" on public.folder_items;
create policy "folder items owned"
  on public.folder_items for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded sound effects (private; served via signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('effect-sounds', 'effect-sounds', false)
on conflict (id) do nothing;

drop policy if exists "sounds readable by group" on storage.objects;
create policy "sounds readable by group"
  on storage.objects for select to authenticated
  using (bucket_id = 'effect-sounds');

drop policy if exists "sounds uploadable by group" on storage.objects;
create policy "sounds uploadable by group"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'effect-sounds');

drop policy if exists "sounds deletable by group" on storage.objects;
create policy "sounds deletable by group"
  on storage.objects for delete to authenticated
  using (bucket_id = 'effect-sounds');


-- ---------------------------------------------------------------------------
-- Realtime: lock the broadcast channel to logged-in users only
-- ---------------------------------------------------------------------------
-- Supabase Realtime "private" channels authorise against realtime.messages.
-- These policies say: you must be an authenticated user to send or receive on
-- any channel. That is what makes "friends can only change your lights while
-- you are logged in" true at the transport layer as well as the API layer.
--
-- Note: do NOT add `alter table realtime.messages enable row level security`
-- here. RLS is already enabled on that table by Supabase, the `realtime`
-- schema is locked down, and the statement fails with
-- "42501: must be owner of table messages". Managing policies is permitted;
-- altering the table is not.
--
-- These policies are only half of it. You must ALSO turn off
-- "Allow public access" under Realtime Settings in the dashboard, or private
-- channels are not enforced and the policies below go unconsulted.

drop policy if exists "authenticated realtime access" on realtime.messages;
create policy "authenticated realtime access"
  on realtime.messages for select to authenticated using (true);

drop policy if exists "authenticated realtime send" on realtime.messages;
create policy "authenticated realtime send"
  on realtime.messages for insert to authenticated with check (true);
