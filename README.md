# Party of Effects

A virtual group tabletop experience: synchronised **LIFX lighting**, **Spotify
playback**, and **sound effects** across everybody's houses at once.

It's the [`dndlights`](https://github.com/ethanbudge/dndlights) idea rebuilt for a
group that plays online. One person hits *Fireball*; everyone's bulb flashes and
everyone's speakers fire, wherever in the country they happen to be.

> **Status: first draft.** Everything described below is built and compiles, but
> it has not yet been run end-to-end against real Supabase, LIFX, and Spotify
> accounts. Expect to shake out bugs on the first session.

---

## How it works

```
   Ethan's browser          Friend's browser          Friend's browser
        │                         │                         │
        └───────────┬─────────────┴─────────────┬───────────┘
                    │                           │
            Supabase Realtime          Stateless API (Hono)
          "someone fired Fireball"     ├─ decrypts YOUR token
           — intent only, no           ├─ calls LIFX for YOU
             secrets on the wire       └─ refreshes YOUR Spotify
                    │                           │
                    ▼                           ▼
          each browser decides            api.lifx.com
          to act, for itself           accounts.spotify.com
```

The important structural choice: **the broadcast carries intent, never commands
and never credentials.** A message says "effect `abc-123` fired". Each browser
then decides whether to act, and if it does, it acts *on its own account* using
*its own login*. No other person's session can cause your token to be decrypted.

That gives you the property you asked for, as a consequence of the architecture
rather than as a rule bolted on top: **your friends cannot touch your lights
unless you are logged in at the same time.** If your browser isn't connected,
there is nothing listening, and nothing on the server will act on your behalf.

---

## Security model

| Secret | Where it lives | Who can read it |
|---|---|---|
| LIFX personal access token | Postgres, AES-256-GCM ciphertext | The API server, only while serving a request carrying that user's own JWT |
| Spotify refresh token | Postgres, AES-256-GCM ciphertext | Same |
| Spotify access token | Browser memory, ~1 hour lifetime | That one user's tab (the Web Playback SDK genuinely requires it client-side) |
| Master encryption key | Server environment / Cloudflare secret | Never leaves the server |
| Supabase `service_role` key | Server environment only | Never shipped to any browser |

Specifics:

- **`user_credentials` has RLS enabled and zero policies.** In Postgres that
  means total denial. The browser's anon key cannot read that table — not other
  people's rows, not even its own. There is no API endpoint that returns a stored
  secret; `GET /api/credentials/status` returns booleans.
- **Every secret is encrypted at rest** with AES-256-GCM under a key the database
  never sees. A database dump on its own yields nothing usable.
- **GCM is authenticated**, so tampered ciphertext is rejected rather than
  silently decrypted to garbage.
- **The OAuth `state` parameter is HMAC-signed** and carries the user id. The
  Spotify callback arrives as a bare browser redirect with no auth header, so
  without a signature anyone could bind their Spotify account onto your row.
- **JWTs are verified locally** on every request (HS256 secret or JWKS), so no
  route touches a secret without a proven identity — and there's no network hop
  in front of each light frame.
- **The one honest caveat:** the server *can* decrypt your tokens, because it has
  to in order to act for you. That's inherent to any app that controls your
  lights while you're using it. What's constrained is *when* — only in response
  to a request carrying your own valid, unexpired login.

Access to the app itself is controlled by turning off public signups in Supabase
once your group has accounts. See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) §5 —
that step is what makes this private, so don't skip it.

---

## Keeping sound and light together

The requirement is that each person's own audio and lighting land together, even
if the group drifts apart slightly. That drove the design:

- **The browser owns the clock.** Audio is scheduled on the Web Audio clock,
  which is sample-accurate. Light frames are polled against *that same clock*. If
  the server drove the timeline instead, sound and light would run on two
  different clocks with a network link between them and drift apart.
- **Light commands are sent early.** The app measures the real round trip to LIFX
  from your machine and fires each frame that far ahead of its timestamp, so the
  flash lands on the beat instead of trailing it. There's a manual nudge slider in
  **Connections → Light timing** if your setup needs it.
- **Sound is preloaded and decoded at startup**, never fetched at trigger time.
- **Cross-person alignment** uses a 400 ms shared head start on broadcasts —
  enough for every browser to receive the message and queue its audio. In
  practice everyone fires within a few tens of milliseconds.

---

## Local setup

Prerequisites: **Node 20+**, a Supabase project, a LIFX account, a Spotify
Premium account, and a Spotify developer app.

```bash
git clone https://github.com/ethanbudge/party-of-effects
cd party-of-effects
npm install
```

**1. Supabase** — follow [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) start to finish.
That includes loading `supabase/seed.sql`, which brings over all 22 scenes and
43 spells/effects from the dndlights R package with their original colours and
frame timings (see [Presets](#presets-from-dndlights) below).

**2. Spotify** — at <https://developer.spotify.com/dashboard>, create an app and
add this exact Redirect URI:

```
http://127.0.0.1:8787/api/spotify/callback
```

Spotify rejects `localhost` in redirect URIs, which is why everything here uses
`127.0.0.1`. Then add each of your friends' Spotify accounts under the app's
**User Management** — a Development Mode app allows 25 named users, which is
plenty, and means you never need Spotify's app review.

**3. Environment files**

```bash
bash scripts/setup-env.sh
```

Prompts for the six values you copy out of the Supabase and Spotify dashboards,
generates `CREDENTIAL_ENC_KEY` for you, and writes `server/.env` and `web/.env`
with the right variable in the right file. It refuses to continue if the anon
and service_role keys are swapped — that mistake would ship an RLS-bypassing key
to every browser, and it's silent otherwise.

Prefer doing it by hand? Copy `server/.env.example` and `web/.env.example` and
fill them in; `openssl rand -base64 32` generates the encryption key.

Either way, back up `CREDENTIAL_ENC_KEY` somewhere outside the repo — if you lose
it, everyone has to reconnect LIFX and Spotify.

**4. Run**

```bash
npm run dev
```

API on `http://127.0.0.1:8787`, app on `http://127.0.0.1:5173`.

Sign up, then connect LIFX and Spotify in the **Connections** dialog.

---

## The three tabs

**General** — live colour, brightness, and fade for the whole party, plus a
playlist box. Every control has an "everyone" and a "just me" version. Shows who
is currently connected, which is exactly the set of people who can be affected.

**Scenes** — a scene is a colour, a brightness, and an optional Spotify playlist.
Cueing one sets everyone's ambient light and starts the playlist on each person's
own account. The ambient state is what effects fade back to.

**Effects** — a sound file plus a timeline of light keyframes. Upload a sound and
the app decodes it, measures its length, and draws the waveform; click the
waveform to drop a frame, then set its colour, brightness, and fade. Same model
as `dndlights`' hand-written `change_light()` chains, but authored visually and
shared with the group.

**Folders** are on both tabs and are **private to each person**. The scene and
effect libraries are shared — anyone can add or delete — but how you organise
them into folders is yours alone. Drag a tile's coloured area into a folder, drag
between folders, or drag back to the drawer to unfile.

Each tile is a **gradient hero card**. A scene shows its colour at its actual
brightness; an effect shows a left-to-right gradient through its frames *in time
order*, with tick marks where the keyframes fall. So Fireball's tile visibly
darkens, flashes bright at the explosion, and decays — you can pick an effect out
of a grid by its shape without reading the label.

### Editing an effect

The timeline is the centre of it. Click anywhere to drop a keyframe, drag a
marker to move it in time, click one to edit its colour, and use ← → to nudge
(Shift for 100 ms steps, Backspace to delete). The waveform sits behind the
markers so you can put the flash exactly on the audio peak, and **Preview**
runs the whole thing on your own lights with a playhead tracking along.

Colour is picked on a **hue/saturation wheel** with a separate brightness slider
and a white-temperature strip, matching how the LIFX app presents colour. That
separation is deliberate: on a bulb, saturation and brightness are independent
controls, and a browser's default square picker conflates them.

### Per-person settings

Two settings under your name in the top bar exist so people with different rooms
can share the same effects:

- **Maximum brightness** scales everything sent to your lights. At an 80% cap, an
  effect authored at 50% lands at 40% on your bulbs. It applies to effects other
  people trigger too, because each browser applies *its own* cap — so you can sit
  at a comfortable level without anyone re-authoring anything.
- **Which lights take part** limits the app to the bulbs you tick. Unticked bulbs
  are never sent a command at all, so they stay exactly as you left them.

Both are stored per user with owner-only RLS, and applied at the single point
where light commands leave the app — so they cover scenes, effects, and the
General tab identically.

### Now playing

Two docks in the bottom-left corner: the current effect, and the current scene
with its Spotify track. The music dock's skip, pause, and resume act on
*everyone*, so you can move past a track without anyone falling out of sync.

---

## Presets from dndlights

`supabase/seed.sql` ports the whole dndlights library — **22 scenes** and **43
spells and effects** (284 light frames), with their original colours,
brightnesses, playlists, and timings.

The timing conversion is the interesting part. dndlights ran frames
*sequentially*: `change_light()` started a transition of `duration` seconds and
then slept for exactly that long before the next call. This app stores absolute
keyframes instead, so each frame's `t_ms` is the running total of every duration
before it, and `fade_ms` is that frame's own transition. Fireball's explosion
frame, the 4th of 7, lands at 1760 ms — `500 + 400 + 860` — exactly where the R
package fired it.

Two fixups were needed on the way across:

- **Playlist URIs.** dndlights stored share links with a `?si=…` tracking
  parameter glued on. Spotify's `context_uri` rejects query parameters, so every
  URI is stripped back to `spotify:playlist:<id>`.
- **Names.** Rendered the way the R addin's buttons did, via `toTitleCase` — so
  "Ray of Frost", not "Ray Of Frost".

**Sounds come from the dndlights `sounds` release**, which has all 43 `.wav`
files (~95 MB). After loading the seed:

```bash
node scripts/import-sounds.mjs
```

Each file is downloaded, uploaded to the `effect-sounds` bucket, and attached to
the effect whose name matches (`Fireball` → `fireball.wav`). Re-running skips
anything that already has audio; `--force` re-uploads, `--dry-run` just lists.

Effects seeded without audio still work — the lights run, there's just no sound —
so this step can wait.

To regenerate after changing dndlights:

```bash
python3 scripts/port-from-dndlights.py ~/path/to/dndlights
```

It validates hex codes, brightness ranges, frame ordering, playlist URI shape,
and that every folder grouping refers to a real scene or effect — and refuses to
write anything if a check fails.

---

## Deploying to Cloudflare

**Short version: Cloudflare is a good fit here, and this draft is already
structured for it.** But the reason it's a good fit is worth understanding,
because the obvious version of this app would *not* have been.

Cloudflare Workers is a serverless edge runtime. It can't hold a long-lived
WebSocket server in memory — a normal `express` + `ws` "game room" backend does
not run there. You'd need Durable Objects, a paid add-on and a different
programming model, and that's the trap a project like this usually falls into.

This draft sidesteps it: **the API is completely stateless**, and the live channel
is Supabase Realtime, which browsers connect to directly without the API in the
middle. So there's nothing stateful to host.

Three concrete things make the code portable:

- `server/src/index.ts` holds the app; `node.ts` and `worker.ts` are thin entry
  points. No route knows which one started it.
- Crypto uses the Web Crypto API, not `node:crypto`.
- Config arrives through one `Env` interface, matching how Workers passes
  bindings.

When you're ready:

```bash
# Frontend -> Cloudflare Pages
cd web && npm run build            # then point Pages at web/dist

# API -> Cloudflare Workers
cd server
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CREDENTIAL_ENC_KEY
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler deploy
```

Then update `wrangler.toml`'s `[vars]`, the Spotify redirect URI, and Supabase's
Site URL to your real domain.

**Two things to get right when you go live**, both easy to miss:

1. **Update `WEB_APP_URL`.** It drives CORS. Leave it on `127.0.0.1` and the
   deployed frontend gets blocked by the browser.
2. **Consider putting Cloudflare Access in front of the app.** It's free at your
   scale and adds a second, independent gate: an email allowlist checked at
   Cloudflare's edge, before a request ever reaches your code. Belt and braces
   alongside the Supabase signup lockout.

Expected cost at this scale: **$0–5/month.** Cloudflare Pages and Workers have
free tiers you won't come close to exhausting, Supabase's free tier covers the
database and a few MB of sound files, and both LIFX and Spotify's APIs are free.
A domain is the only guaranteed cost, around $12/year, and it's optional.

---

## Known limits

- **Spotify Jam has no public API.** There is no endpoint to create, join, or
  drive a Jam — it's a client-side feature of Spotify's own apps. This plays the
  same playlist on everyone's own account simultaneously instead, which gets you
  the same experience at the table.
- **Spotify Premium is required** for playback control. That's Spotify's
  restriction, not something the app can work around.
- **Everyone needs their own LIFX account and token.** LIFX tokens are scoped to
  the account that owns the bulbs, so there's no way to share one.
- **LIFX rate limits** are around 120 requests/minute per token. An effect uses
  5–8. You'd need to be firing effects continuously to hit it, but a runaway loop
  could.
- **Effect sounds play through the browser tab**, so the tab must stay open. It
  also needs one click before audio will start — a browser autoplay rule.

---

## Layout

```
supabase/schema.sql   Tables, RLS, storage bucket. Paste into the SQL editor.
server/               Stateless API. Runs on Node locally, Workers in production.
  src/crypto.ts       AES-256-GCM + signed OAuth state (Web Crypto, portable)
  src/auth.ts         Local JWT verification
  src/routes/         credentials, lifx, spotify
web/                  React + Vite frontend
  src/lib/sequencer.ts  Audio + light sync engine
  src/lib/realtime.ts   Supabase broadcast channel
  src/lib/spotify.ts    Web Playback SDK
  src/tabs/             General, Scenes, Effects
```

## License

MIT
