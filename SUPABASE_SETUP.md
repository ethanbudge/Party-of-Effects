# Supabase setup

Everything you need to do inside Supabase, in order. Takes about ten minutes.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it whatever you like. Pick the region closest to most of your group.
3. Set a database password and save it somewhere. You won't need it for this app,
   but you'll want it if you ever connect directly.
4. Wait for the project to finish provisioning (~2 minutes).

---

## 2. Run the schema

1. In the left sidebar: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in.
3. Click **Run**.

You should see "Success. No rows returned." This creates every table, all the
Row Level Security policies, the storage bucket for sound files, and the trigger
that gives each new user a profile.

The file is safe to re-run if you ever need to.

> **If you get `ERROR: 42501: must be owner of table messages`**, you have an
> older copy of `schema.sql` that tried to run
> `alter table realtime.messages enable row level security`. Pull the latest
> version of the repo — that line is gone. RLS is already enabled on that table
> by Supabase, and the `realtime` schema is locked so the statement can never
> succeed. Creating *policies* there is allowed; altering the table is not.
>
> The SQL editor runs the file in a transaction, so a failure anywhere rolls the
> whole thing back — nothing was half-applied. Just re-run the corrected file.

---

## 3. Collect your keys

Go to **Project Settings** → **API** (newer dashboards split this into
**Data API** and **API Keys**). You need three values:

| Value | Goes in | Notes |
|---|---|---|
| Project URL | `web/.env` and `server/.env` | e.g. `https://abcdefgh.supabase.co` |
| `anon` / publishable key | `web/.env` | Safe to ship to browsers |
| `service_role` / secret key | `server/.env` **only** | **Bypasses all RLS. Never put this in `web/`.** |

If your project also shows a **JWT Secret** (older projects, under Settings →
API → JWT Settings), copy it into `SUPABASE_JWT_SECRET` in `server/.env`. If you
don't see one, leave that variable blank — the server will verify tokens against
your project's public JWKS endpoint instead.

**Don't hand-edit the files.** Run this instead and paste the values when asked:

```bash
bash scripts/setup-env.sh
```

It puts each value in the right file, generates `CREDENTIAL_ENC_KEY`, sets the
files to `chmod 600`, and stops if the anon and service_role keys are swapped.
That swap is the one mistake worth guarding against: it publishes a key that
bypasses every RLS policy on this page to anyone who loads the app.

---

## 3b. Load the dndlights presets (optional but recommended)

`supabase/seed.sql` carries all 22 scenes and all 43 spells/effects ported from
the dndlights R package, with their original colours, brightnesses, playlists,
and frame timings. **SQL Editor** → **New query** → paste the file → **Run**.

Idempotent, like the schema — re-running adds only what's missing and never
overwrites anything you've since edited.

Two things to know:

- **Effects arrive with no sound.** The `.wav` files were never in the dndlights
  repo, so the lights work immediately but nothing plays. To add audio, open an
  effect in the app and attach the file. Names match the originals, so `Fireball`
  wants `fireball.wav`.
- **Then import the sounds.** The dndlights `sounds` release has all 43 `.wav`
  files. Once the seed is loaded and `server/.env` is filled in:

  ```bash
  node scripts/import-sounds.mjs --dry-run   # see what it would do
  node scripts/import-sounds.mjs             # ~95 MB, a few minutes
  ```

  It downloads each file, uploads it to the `effect-sounds` bucket, and points
  the matching effect at it. Re-running skips effects that already have audio.

- **The last block is optional.** It rebuilds the dndlights folder groupings
  (Offensive, Elemental, Creatures, …) for one person. Folders are private per
  user, so change `YOUR_EMAIL_HERE` to your login email before running it, and
  have each friend run that block with their own email if they want the same
  layout. Everyone can also just drag things into their own folders instead.

To regenerate the file after changing dndlights:

```bash
python3 scripts/port-from-dndlights.py ~/path/to/dndlights
```

---

## 4. Configure auth

Go to **Authentication** → **Sign In / Providers** → **Email**:

- **Confirm email** — turn this **off** for now. Otherwise every account needs a
  working inbox round-trip before it can log in, and Supabase's built-in mailer
  is rate-limited to a handful of messages an hour. You can turn it back on later
  once you've set up your own SMTP.
- Leave **Enable email provider** on.

Then go to **Authentication** → **URL Configuration**:

- **Site URL**: `http://127.0.0.1:5173` for local development.
  Change this to your real domain when you deploy.

---

## 5. Create your group's accounts, then lock the door

This is the step that actually makes the app private, so don't skip the second half.

1. Start the app (`npm run dev`) and have each person sign up, **or** create their
   accounts yourself under **Authentication** → **Users** → **Add user**.
2. Once everyone has an account: **Authentication** → **Sign In / Providers** →
   **Email** → turn **"Allow new users to sign up"** OFF.

After that toggle is off, nobody new can create an account — not through the
app's signup form, and not by calling the Supabase API directly with the public
anon key. Before you flip it, anyone who finds your URL can sign up.

To add someone later, add them manually under **Authentication → Users**. You
don't need to re-open public signups.

---

## 6. Check the storage bucket

**Storage** in the sidebar should show a bucket called `effect-sounds`, marked
**Private**. The schema created it. If it's missing, create it manually with that
exact name and leave "Public bucket" unchecked — sound files are served through
short-lived signed URLs, not public links.

---

## 7. Lock down the Realtime channel

Go to **Realtime** → **Settings** and turn **"Allow public access"** OFF.

Don't skip this one. The policies in `schema.sql` restrict the broadcast channel
to authenticated users, but they are only *consulted* when public access is
disabled. Leave it on and the app's `private: true` channel setting is ignored —
anyone who loads the page can pull the public anon key out of the JavaScript
bundle, connect to the channel without logging in, and fire effects at whoever
is currently online. With it off, joining the channel requires a real login.

---

## 8. Verify RLS is doing its job

Worth thirty seconds, because this is the control protecting everyone's tokens.

**SQL Editor** → new query:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every row must show `rowsecurity = true`. Then:

```sql
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
```

`user_credentials` should **not appear in this list at all**. That's correct and
intentional: RLS enabled with zero policies means Postgres denies every read and
write from the browser's anon key. Only the server's `service_role` key can reach
that table, and it only ever does so on behalf of the user whose own login token
came in on the request.

Finally, confirm the two Realtime policies landed:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'realtime' and tablename = 'messages';
```

You should get two rows — one `SELECT` (receive) and one `INSERT` (send). If this
comes back empty, the broadcast channel will reject every subscription and the
app will sit on "connecting…" forever.

---

## What you do NOT need

- No Edge Functions.
- No Supabase CLI or local Docker stack.
- No database migrations tooling — `schema.sql` is the whole schema.
- No paid tier. A group of 4–8 people fits comfortably in the free plan; the
  sound files are the only meaningful storage and they're a few MB total.
