#!/usr/bin/env python3
"""
Regenerate supabase/seed.sql from a checkout of the dndlights R package.

    python3 scripts/port-from-dndlights.py ~/path/to/dndlights

Reads R/scenes.R, R/spells.R, R/effects.R and R/addin.R, converts the
sequential change_light() calls into absolute keyframe timelines, and writes
supabase/seed.sql. Re-run this if you change dndlights and want the presets
refreshed. Validates everything before writing; exits non-zero on any problem.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_SRC = HERE.parent.parent / "dndlights"
SRC = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SRC
R = SRC / "R"

if not (R / "scenes.R").exists():
    sys.exit(
        f"Could not find R/scenes.R under {SRC}\n"
        f"Usage: python3 scripts/port-from-dndlights.py /path/to/dndlights"
    )

OUT = HERE.parent / "supabase" / "seed.sql"

# --------------------------------------------------------------------------
# Scenes
# --------------------------------------------------------------------------
scenes_src = (R / "scenes.R").read_text()
# Only the .scene_defs list, so cue_scene()'s own change_light call is excluded.
defs_start = scenes_src.index(".scene_defs <- list(")
defs_end = scenes_src.index("\ncue_scene <- function")
defs_block = scenes_src[defs_start:defs_end]

scene_re = re.compile(
    r"^\s{2}([a-z_0-9]+)\s*=\s*list\(\s*"
    r"color\s*=\s*\"([^\"]+)\"\s*,\s*brightness\s*=\s*([0-9.]+)\s*,\s*"
    r"playlist\s*=\s*\"([^\"]*)\"",
    re.MULTILINE,
)

scenes = []
for name, color, bright, playlist in scene_re.findall(defs_block):
    # dndlights stored share-links with a ?si= tracking param appended to the
    # URI. Spotify's context_uri does not accept query params, so strip it.
    uri = playlist.split("?")[0].strip()
    if "PLACEHOLDER" in uri.upper() or not uri:
        uri = None
    scenes.append(
        {
            "name": name,
            "hex": color.upper(),
            "brightness": float(bright),
            "playlist": uri,
        }
    )

# --------------------------------------------------------------------------
# Spells + effects -> keyframe timelines
# --------------------------------------------------------------------------
fn_re = re.compile(
    r"^([a-z_0-9]+)\s*<-\s*function\(\)\s*\{(.*?)^\}", re.MULTILINE | re.DOTALL
)
call_re = re.compile(
    r"change_light\(\s*color_name\s*=\s*\"([^\"]+)\"\s*,\s*"
    r"brightness\s*=\s*([0-9.]+)\s*,\s*duration\s*=\s*([0-9.]+)"
)
revert_re = re.compile(r"revert_state\(\s*duration\s*=\s*([0-9.]+)\s*\)")
sound_re = re.compile(r'\.get_sound_path\(\s*"([^"]+)"')

effects = []
for src_name in ("spells.R", "effects.R"):
    body = (R / src_name).read_text()
    for fname, fbody in fn_re.findall(body):
        calls = call_re.findall(fbody)
        if not calls:
            continue

        # dndlights runs these sequentially: change_light() sets a transition of
        # `duration` seconds and then sleeps that long before the next call.
        # So a frame's absolute start time is the running total of every
        # duration before it, and its own duration is the fade INTO it.
        t = 0.0
        frames = []
        for color, bright, dur in calls:
            frames.append(
                {
                    "t_ms": round(t * 1000),
                    "hex": color.upper(),
                    "brightness": float(bright),
                    "fade_ms": round(float(dur) * 1000),
                }
            )
            t += float(dur)

        rev = revert_re.search(fbody)
        snd = sound_re.search(fbody)
        effects.append(
            {
                "name": fname,
                "frames": frames,
                "duration_ms": round(t * 1000),
                "revert_ms": round(float(rev.group(1)) * 1000) if rev else 2000,
                "sound": snd.group(1) if snd else None,
                "source": src_name,
            }
        )

# --------------------------------------------------------------------------
# Groupings (from the addin's button layout) -> optional per-user folders
# --------------------------------------------------------------------------
addin = (R / "addin.R").read_text()


def rvec(var):
    m = re.search(rf"^\s+{var}\s*<-\s*c\((.*?)\)", addin, re.MULTILINE | re.DOTALL)
    return re.findall(r'"([a-z_0-9]+)"', m.group(1)) if m else []


FOLDERS = [
    ("scene", "Indoor Locations", rvec("scenes_urban")),
    ("scene", "Outdoor & Depths", rvec("scenes_outdoors")),
    ("scene", "Combat", rvec("scenes_combat")),
    ("scene", "Ambient", rvec("scenes_ambient")),
    ("effect", "Offensive", rvec("spells_offensive")),
    ("effect", "Elemental", rvec("spells_elemental")),
    ("effect", "Necrotic", rvec("spells_necrotic")),
    ("effect", "Healing & Support", rvec("spells_healing")),
    ("effect", "Defense", rvec("spells_defense")),
    ("effect", "Utility", rvec("spells_utility")),
    ("effect", "PC Combat", rvec("effects_pc_combat")),
    ("effect", "Creatures", rvec("effects_creatures")),
    ("effect", "Magical & Environmental", rvec("effects_magical")),
]

# --------------------------------------------------------------------------
# Validate before emitting
# --------------------------------------------------------------------------
problems = []
scene_names = {s["name"] for s in scenes}
effect_names = {e["name"] for e in effects}

if len(scene_names) != len(scenes):
    problems.append("duplicate scene names")
if len(effect_names) != len(effects):
    problems.append("duplicate effect names")

for s in scenes:
    if not re.fullmatch(r"#[0-9A-F]{6}", s["hex"]):
        problems.append(f"scene {s['name']}: bad hex {s['hex']}")
    if not 0 <= s["brightness"] <= 1:
        problems.append(f"scene {s['name']}: brightness out of range")
    if s["playlist"] and not re.fullmatch(
        r"spotify:(playlist|album|artist):[A-Za-z0-9]+", s["playlist"]
    ):
        problems.append(f"scene {s['name']}: bad playlist uri {s['playlist']}")

for e in effects:
    for f in e["frames"]:
        if not re.fullmatch(r"#[0-9A-F]{6}", f["hex"]):
            problems.append(f"effect {e['name']}: bad hex {f['hex']}")
        if not 0 <= f["brightness"] <= 1:
            problems.append(f"effect {e['name']}: brightness out of range")
    if e["frames"] != sorted(e["frames"], key=lambda f: f["t_ms"]):
        problems.append(f"effect {e['name']}: frames not monotonic")

for kind, _label, members in FOLDERS:
    pool = scene_names if kind == "scene" else effect_names
    for m in members:
        if m not in pool:
            problems.append(f"folder member '{m}' has no matching {kind}")

if problems:
    print("VALIDATION FAILED:", file=sys.stderr)
    for p in problems:
        print("  -", p, file=sys.stderr)
    sys.exit(1)

uncovered_s = scene_names - {m for k, _, ms in FOLDERS if k == "scene" for m in ms}
uncovered_e = effect_names - {m for k, _, ms in FOLDERS if k == "effect" for m in ms}

# --------------------------------------------------------------------------
# Emit SQL
# --------------------------------------------------------------------------
def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


# Match R's tools::toTitleCase, which the dndlights addin used for button
# labels: small words stay lowercase unless they lead. Plain .title() would
# give "Ray Of Frost".
SMALL = {"of", "the", "a", "an", "and", "or", "to", "in", "on", "at", "for", "with"}


def title(n):
    words = n.replace("_", " ").split()
    return " ".join(
        w.capitalize() if i == 0 or w not in SMALL else w for i, w in enumerate(words)
    )


out = []
out.append(f"""-- ============================================================================
-- Party of Effects — seed data ported from the dndlights R package
-- ============================================================================
-- {len(scenes)} scenes and {len(effects)} effects, generated from
-- dndlights R/scenes.R, R/spells.R, R/effects.R and R/addin.R.
--
-- Run this in the Supabase SQL Editor AFTER schema.sql.
--
-- Idempotent: every insert is guarded by a name check, so re-running adds only
-- what is missing and never overwrites anything you have since edited.
--
-- TIMING MODEL
-- dndlights ran its light frames sequentially — change_light() started a
-- transition of `duration` seconds and then slept for exactly that long before
-- the next call. So each frame's absolute start time here is the running total
-- of all durations before it, and fade_ms is that frame's own transition. The
-- resulting timeline is identical to what the R package produced.
--
-- SOUNDS
-- Effects are seeded with sound_path = null, because the .wav files were never
-- in the dndlights repo (inst/sounds/ holds only a .gitkeep). The lights work
-- straight away; to add audio, open an effect in the app and attach the file.
-- Each effect's name matches its original filename — `fireball` wants
-- fireball.wav, and so on.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Scenes ({len(scenes)})
-- ---------------------------------------------------------------------------""")

for s in scenes:
    out.append(
        f"""insert into public.scenes (name, hex, brightness, playlist_uri)
select {q(title(s['name']))}, {q(s['hex'])}, {s['brightness']}, {q(s['playlist'])}
where not exists (select 1 from public.scenes where name = {q(title(s['name']))});"""
    )

out.append(
    f"""

-- ---------------------------------------------------------------------------
-- Effects ({len(effects)})
-- ---------------------------------------------------------------------------"""
)

for e in effects:
    frames_json = json.dumps(e["frames"], separators=(",", ":"))
    out.append(
        f"""-- {title(e['name'])} — {len(e['frames'])} frames, {e['duration_ms']}ms, sound: {e['sound'] or 'n/a'}
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms)
select {q(title(e['name']))}, null, {e['duration_ms']}, {q(frames_json)}::jsonb, {e['revert_ms']}
where not exists (select 1 from public.effects where name = {q(title(e['name']))});"""
    )

# --- optional folder block ---
folder_sql = []
for kind, label, members in FOLDERS:
    if not members:
        continue
    # No unique constraint on folders(owner_id, name, kind), so ON CONFLICT has
    # nothing to key off and re-running would pile up duplicates. Look first,
    # insert only if absent.
    folder_sql.append(f"""
    -- {label}
    select id into fid from public.folders
    where owner_id = target and name = {q(label)} and kind = {q(kind)};

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, {q(label)}, {q(kind)}, {FOLDERS.index((kind, label, members))})
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, {q(kind)}, t.id, t.ord
    from (
      select {'s' if kind == 'scene' else 'e'}.id, x.ord
      from unnest(array[{','.join(q(title(m)) for m in members)}]) with ordinality as x(nm, ord)
      join public.{'scenes s' if kind == 'scene' else 'effects e'}
        on {'s' if kind == 'scene' else 'e'}.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;
""")

out.append(f"""

-- ---------------------------------------------------------------------------
-- OPTIONAL: recreate the dndlights folder groupings for one person
-- ---------------------------------------------------------------------------
-- Folders are private to each user, so this has to name whose folders to build.
-- Put your login email in the line marked below, then run this block. Each
-- person who wants the same layout runs it with their own email (or just drags
-- things into their own folders in the app).
--
-- Safe to re-run.

do $$
declare
  target uuid;
  fid    uuid;
begin
  select id into target from auth.users
  where email = 'YOUR_EMAIL_HERE';          -- <<< change this

  if target is null then
    raise notice 'No user with that email — sign up first, then re-run this block.';
    return;
  end if;
{''.join(folder_sql)}
  raise notice 'Folders created for %', target;
end $$;
""")

OUT.write_text("\n".join(out) + "\n")
print(f"wrote {OUT}")

# --------------------------------------------------------------------------
print(f"scenes:  {len(scenes)}")
print(f"effects: {len(effects)}  (spells: "
      f"{sum(1 for e in effects if e['source'] == 'spells.R')}, "
      f"non-spell: {sum(1 for e in effects if e['source'] == 'effects.R')})")
print(f"frames:  {sum(len(e['frames']) for e in effects)} total")
print(f"scenes with playlists: {sum(1 for s in scenes if s['playlist'])}/{len(scenes)}")
if uncovered_s:
    print(f"scenes in no folder: {sorted(uncovered_s)}")
if uncovered_e:
    print(f"effects in no folder: {sorted(uncovered_e)}")
print("\nlongest effects:")
for e in sorted(effects, key=lambda x: -x["duration_ms"])[:3]:
    print(f"  {e['name']:22} {e['duration_ms']:>6}ms  {len(e['frames'])} frames")
print("\nshortest effects:")
for e in sorted(effects, key=lambda x: x["duration_ms"])[:3]:
    print(f"  {e['name']:22} {e['duration_ms']:>6}ms  {len(e['frames'])} frames")
