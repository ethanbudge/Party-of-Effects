-- ============================================================================
-- Party of Effects — seed data ported from the dndlights R package
-- ============================================================================
-- 22 scenes and 43 effects, generated from
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
-- Scenes (22)
-- ---------------------------------------------------------------------------
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Dueling Club', '#C87820', 0.3, 'spotify:playlist:47cMNWd7HteEWNKafIBy5P'
where not exists (select 1 from public.scenes where name = 'Dueling Club');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Noble House', '#D4961E', 0.28, 'spotify:playlist:7b09RNPhEh3OtBIg0v2FHH'
where not exists (select 1 from public.scenes where name = 'Noble House');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Detective Office', '#E8A000', 0.12, 'spotify:playlist:0iEqFsH5710NeQIsjY6GRV'
where not exists (select 1 from public.scenes where name = 'Detective Office');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Curio Shop', '#A8B040', 0.3, 'spotify:playlist:0GkkCFKCZBasPAH3AYbbfX'
where not exists (select 1 from public.scenes where name = 'Curio Shop');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Newspaper', '#FFDA80', 0.7, 'spotify:playlist:5iAKfKLlsGyjAfu4ewx7nI'
where not exists (select 1 from public.scenes where name = 'Newspaper');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Ironbottom Riots', '#E88C14', 0.5, 'spotify:playlist:6m3PyWHc1K2Et4PWwWqoyy'
where not exists (select 1 from public.scenes where name = 'Ironbottom Riots');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Ironbottom Neutral', '#FFE060', 0.85, 'spotify:playlist:22d55dZa63IuYnVrohz29R'
where not exists (select 1 from public.scenes where name = 'Ironbottom Neutral');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Ironbottom Night', '#B04808', 0.18, 'spotify:playlist:37R2hKuxOd9QzFslqXDXAj'
where not exists (select 1 from public.scenes where name = 'Ironbottom Night');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Tavern', '#CC7820', 0.4, 'spotify:playlist:3fFObop6jjj38jXoUXrUHt'
where not exists (select 1 from public.scenes where name = 'Tavern');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Ballroom', '#E8C030', 0.38, 'spotify:playlist:5nzmZMA0K3U0FIHxw6V70m'
where not exists (select 1 from public.scenes where name = 'Ballroom');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Combat 1', '#E8C030', 0.38, 'spotify:playlist:4mirB6vFgWAm2JtVt0DvUn'
where not exists (select 1 from public.scenes where name = 'Combat 1');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Mine', '#7800CC', 0.08, 'spotify:playlist:2aUhqxrhZfEwDJ4YHALuJo'
where not exists (select 1 from public.scenes where name = 'Mine');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Combat 2', '#7800CC', 0.08, 'spotify:playlist:0eOHdH2Dp35vccbF2ePfZh'
where not exists (select 1 from public.scenes where name = 'Combat 2');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Factory', '#E84A00', 0.6, 'spotify:playlist:0gMWkF51N34O3HtDOpuOW5'
where not exists (select 1 from public.scenes where name = 'Factory');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Combat 3', '#E84A00', 0.6, 'spotify:playlist:2kgWzqO1GBRI35jNBTSbA7'
where not exists (select 1 from public.scenes where name = 'Combat 3');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Combat 4', '#FFE060', 0.85, 'spotify:playlist:3f5vznWOHhdP8H6Ib4N8DW'
where not exists (select 1 from public.scenes where name = 'Combat 4');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Victory', '#FFE060', 0.85, 'spotify:playlist:3YPnzQ6TcXoUAy0G5dCaTX'
where not exists (select 1 from public.scenes where name = 'Victory');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Dream Sequence', '#C01800', 0.22, 'spotify:playlist:00XuMs8zOdT1KagPXK1qBg'
where not exists (select 1 from public.scenes where name = 'Dream Sequence');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Base 1', '#FFB040', 0.55, 'spotify:playlist:5jwMaDX2Uzoq0lCdhiXGJ4'
where not exists (select 1 from public.scenes where name = 'Base 1');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Base 2', '#D49020', 0.35, 'spotify:playlist:5sSlpIe2qBaUzTDDE154Rw'
where not exists (select 1 from public.scenes where name = 'Base 2');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Base 3', '#FFB040', 0.55, 'spotify:playlist:1pP5lXmBbzja8h1Umtlcof'
where not exists (select 1 from public.scenes where name = 'Base 3');
insert into public.scenes (name, hex, brightness, playlist_uri)
select 'Base 4', '#D49020', 0.35, 'spotify:playlist:0GSqqyr05SnnzCtujMpIgc'
where not exists (select 1 from public.scenes where name = 'Base 4');


-- ---------------------------------------------------------------------------
-- Effects (43)
-- ---------------------------------------------------------------------------
-- Fireball — 7 frames, 4240ms, sound: fireball.wav, voice: Boule de feu
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Fireball', null, 4240, '[{"t_ms":0,"hex":"#A04018","brightness":0.35,"fade_ms":500},{"t_ms":500,"hex":"#C8581C","brightness":0.55,"fade_ms":400},{"t_ms":900,"hex":"#E07020","brightness":0.75,"fade_ms":860},{"t_ms":1760,"hex":"#FDBE49","brightness":0.98,"fade_ms":100},{"t_ms":1860,"hex":"#FF7A00","brightness":0.82,"fade_ms":280},{"t_ms":2140,"hex":"#E84500","brightness":0.58,"fade_ms":550},{"t_ms":2690,"hex":"#C03A14","brightness":0.3,"fade_ms":1550}]'::jsonb, 4000, array['Boule de feu']::text[]
where not exists (select 1 from public.effects where name = 'Fireball');
-- Eldritch Blast — 6 frames, 2260ms, sound: eldritch_blast.wav, voice: Funeste
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Eldritch Blast', null, 2260, '[{"t_ms":0,"hex":"#0B4858","brightness":0.25,"fade_ms":450},{"t_ms":450,"hex":"#1A7895","brightness":0.55,"fade_ms":300},{"t_ms":750,"hex":"#4AB0CC","brightness":0.75,"fade_ms":250},{"t_ms":1000,"hex":"#00E5FF","brightness":0.95,"fade_ms":80},{"t_ms":1080,"hex":"#2298B0","brightness":0.52,"fade_ms":480},{"t_ms":1560,"hex":"#0F4C5C","brightness":0.18,"fade_ms":700}]'::jsonb, 2000, array['Funeste']::text[]
where not exists (select 1 from public.effects where name = 'Eldritch Blast');
-- Ice Knife — 4 frames, 1050ms, sound: ice_knife.wav, voice: Givre
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Ice Knife', null, 1050, '[{"t_ms":0,"hex":"#A8D4EC","brightness":0.5,"fade_ms":140},{"t_ms":140,"hex":"#5BB8E8","brightness":0.95,"fade_ms":80},{"t_ms":220,"hex":"#90C8E8","brightness":0.45,"fade_ms":280},{"t_ms":500,"hex":"#80B0D0","brightness":0.16,"fade_ms":550}]'::jsonb, 3000, array['Givre']::text[]
where not exists (select 1 from public.effects where name = 'Ice Knife');
-- Shield — 4 frames, 1930ms, sound: shield.wav, voice: Bouclier
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Shield', null, 1930, '[{"t_ms":0,"hex":"#FFE680","brightness":0.6,"fade_ms":500},{"t_ms":500,"hex":"#FFE680","brightness":0.92,"fade_ms":80},{"t_ms":580,"hex":"#FFF1B0","brightness":0.65,"fade_ms":350},{"t_ms":930,"hex":"#E8B040","brightness":0.22,"fade_ms":1000}]'::jsonb, 3000, array['Bouclier']::text[]
where not exists (select 1 from public.effects where name = 'Shield');
-- Lightning Bolt — 5 frames, 1820ms, sound: lightning_bolt.wav, voice: Foudre
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Lightning Bolt', null, 1820, '[{"t_ms":0,"hex":"#DCE8FF","brightness":0.38,"fade_ms":320},{"t_ms":320,"hex":"#EEF4FF","brightness":0.7,"fade_ms":220},{"t_ms":540,"hex":"#FFF8C8","brightness":1.0,"fade_ms":80},{"t_ms":620,"hex":"#DCE8FF","brightness":0.45,"fade_ms":300},{"t_ms":920,"hex":"#C8D8F0","brightness":0.12,"fade_ms":900}]'::jsonb, 2000, array['Foudre']::text[]
where not exists (select 1 from public.effects where name = 'Lightning Bolt');
-- Cure Wounds — 8 frames, 3380ms, sound: cure_wounds.wav, voice: Guérison
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Cure Wounds', null, 3380, '[{"t_ms":0,"hex":"#FFF0D0","brightness":0.2,"fade_ms":300},{"t_ms":300,"hex":"#FFE9A8","brightness":0.4,"fade_ms":300},{"t_ms":600,"hex":"#FFE08A","brightness":0.65,"fade_ms":280},{"t_ms":880,"hex":"#FFE08A","brightness":0.9,"fade_ms":100},{"t_ms":980,"hex":"#FFD46A","brightness":0.72,"fade_ms":300},{"t_ms":1280,"hex":"#FFE9A8","brightness":0.5,"fade_ms":400},{"t_ms":1680,"hex":"#FFF1C8","brightness":0.28,"fade_ms":700},{"t_ms":2380,"hex":"#F0D098","brightness":0.12,"fade_ms":1000}]'::jsonb, 4000, array['Guérison']::text[]
where not exists (select 1 from public.effects where name = 'Cure Wounds');
-- Firebolt — 4 frames, 1420ms, sound: firebolt.wav, voice: Étincelle
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Firebolt', null, 1420, '[{"t_ms":0,"hex":"#C06018","brightness":0.52,"fade_ms":340},{"t_ms":340,"hex":"#FF7A00","brightness":0.95,"fade_ms":80},{"t_ms":420,"hex":"#D05800","brightness":0.48,"fade_ms":300},{"t_ms":720,"hex":"#5A1A00","brightness":0.1,"fade_ms":700}]'::jsonb, 2000, array['Étincelle']::text[]
where not exists (select 1 from public.effects where name = 'Firebolt');
-- Prestidigitation — 6 frames, 2510ms, sound: prestidigitation.wav, voice: Sortilège
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Prestidigitation', null, 2510, '[{"t_ms":0,"hex":"#F0E0F0","brightness":0.18,"fade_ms":420},{"t_ms":420,"hex":"#E0CCEC","brightness":0.3,"fade_ms":300},{"t_ms":720,"hex":"#D8C0E8","brightness":0.42,"fade_ms":240},{"t_ms":960,"hex":"#DCC8E5","brightness":0.32,"fade_ms":300},{"t_ms":1260,"hex":"#C8B0D0","brightness":0.18,"fade_ms":450},{"t_ms":1710,"hex":"#A89AB8","brightness":0.08,"fade_ms":800}]'::jsonb, 3000, array['Sortilège']::text[]
where not exists (select 1 from public.effects where name = 'Prestidigitation');
-- Water Whip — 6 frames, 2170ms, sound: water_whip.wav, voice: Fouet
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Water Whip', null, 2170, '[{"t_ms":0,"hex":"#6CC8E0","brightness":0.3,"fade_ms":300},{"t_ms":300,"hex":"#48BAD8","brightness":0.55,"fade_ms":300},{"t_ms":600,"hex":"#38B8DC","brightness":0.75,"fade_ms":340},{"t_ms":940,"hex":"#48CAE4","brightness":0.95,"fade_ms":80},{"t_ms":1020,"hex":"#0096C7","brightness":0.45,"fade_ms":400},{"t_ms":1420,"hex":"#023E8A","brightness":0.16,"fade_ms":750}]'::jsonb, 3000, array['Fouet']::text[]
where not exists (select 1 from public.effects where name = 'Water Whip');
-- Magic Missile — 7 frames, 3040ms, sound: magic_missile.wav, voice: Carreau
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Magic Missile', null, 3040, '[{"t_ms":0,"hex":"#303040","brightness":0.1,"fade_ms":500},{"t_ms":500,"hex":"#B0B0C0","brightness":0.35,"fade_ms":500},{"t_ms":1000,"hex":"#D0D0E0","brightness":0.6,"fade_ms":460},{"t_ms":1460,"hex":"#FFFFFF","brightness":0.98,"fade_ms":80},{"t_ms":1540,"hex":"#E8E8F8","brightness":0.8,"fade_ms":200},{"t_ms":1740,"hex":"#A0A0B8","brightness":0.28,"fade_ms":550},{"t_ms":2290,"hex":"#606078","brightness":0.08,"fade_ms":750}]'::jsonb, 2000, array['Carreau']::text[]
where not exists (select 1 from public.effects where name = 'Magic Missile');
-- Light — 7 frames, 3000ms, sound: light.wav, voice: Lueur
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Light', null, 3000, '[{"t_ms":0,"hex":"#FFF8E0","brightness":0.18,"fade_ms":400},{"t_ms":400,"hex":"#FFFCEA","brightness":0.4,"fade_ms":360},{"t_ms":760,"hex":"#FFFFFA","brightness":0.65,"fade_ms":260},{"t_ms":1020,"hex":"#FFFFFF","brightness":0.88,"fade_ms":100},{"t_ms":1120,"hex":"#FFFFF8","brightness":0.78,"fade_ms":280},{"t_ms":1400,"hex":"#FFF8D6","brightness":0.55,"fade_ms":400},{"t_ms":1800,"hex":"#FFE8A8","brightness":0.2,"fade_ms":1200}]'::jsonb, 4000, array['Lueur']::text[]
where not exists (select 1 from public.effects where name = 'Light');
-- Mage Armor — 8 frames, 4300ms, sound: mage_armor.wav, voice: Égide
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Mage Armor', null, 4300, '[{"t_ms":0,"hex":"#B8D8E8","brightness":0.2,"fade_ms":500},{"t_ms":500,"hex":"#C0D8E0","brightness":0.36,"fade_ms":500},{"t_ms":1000,"hex":"#D8D8C0","brightness":0.52,"fade_ms":500},{"t_ms":1500,"hex":"#E8E0B0","brightness":0.68,"fade_ms":600},{"t_ms":2100,"hex":"#F8E8A8","brightness":0.88,"fade_ms":300},{"t_ms":2400,"hex":"#C8D8D0","brightness":0.55,"fade_ms":200},{"t_ms":2600,"hex":"#90B8D8","brightness":0.32,"fade_ms":500},{"t_ms":3100,"hex":"#6890B8","brightness":0.15,"fade_ms":1200}]'::jsonb, 3000, array['Égide']::text[]
where not exists (select 1 from public.effects where name = 'Mage Armor');
-- Misty Step — 5 frames, 1900ms, sound: misty_step.wav, voice: Brume
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Misty Step', null, 1900, '[{"t_ms":0,"hex":"#E0F7FA","brightness":0.28,"fade_ms":320},{"t_ms":320,"hex":"#6088A0","brightness":0.12,"fade_ms":460},{"t_ms":780,"hex":"#C0E8F0","brightness":0.72,"fade_ms":80},{"t_ms":860,"hex":"#80DEEA","brightness":0.35,"fade_ms":320},{"t_ms":1180,"hex":"#2080A0","brightness":0.08,"fade_ms":720}]'::jsonb, 2000, array['Brume']::text[]
where not exists (select 1 from public.effects where name = 'Misty Step');
-- Private Sanctum — 9 frames, 4580ms, sound: private_sanctum.wav, voice: Citadelle
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Private Sanctum', null, 4580, '[{"t_ms":0,"hex":"#B898C8","brightness":0.18,"fade_ms":450},{"t_ms":450,"hex":"#A878C0","brightness":0.32,"fade_ms":450},{"t_ms":900,"hex":"#9460B8","brightness":0.48,"fade_ms":340},{"t_ms":1240,"hex":"#8050B0","brightness":0.62,"fade_ms":240},{"t_ms":1480,"hex":"#B070E0","brightness":0.88,"fade_ms":100},{"t_ms":1580,"hex":"#7B68EE","brightness":0.68,"fade_ms":300},{"t_ms":1880,"hex":"#6B4A98","brightness":0.42,"fade_ms":300},{"t_ms":2180,"hex":"#4A2A78","brightness":0.25,"fade_ms":800},{"t_ms":2980,"hex":"#28184A","brightness":0.1,"fade_ms":1600}]'::jsonb, 5000, array['Citadelle']::text[]
where not exists (select 1 from public.effects where name = 'Private Sanctum');
-- Booming Blade — 4 frames, 1190ms, sound: booming_blade.wav, voice: Grondement
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Booming Blade', null, 1190, '[{"t_ms":0,"hex":"#4488DD","brightness":0.45,"fade_ms":260},{"t_ms":260,"hex":"#E8F4FF","brightness":0.98,"fade_ms":80},{"t_ms":340,"hex":"#4488DD","brightness":0.52,"fade_ms":300},{"t_ms":640,"hex":"#0A2860","brightness":0.14,"fade_ms":550}]'::jsonb, 2000, array['Grondement']::text[]
where not exists (select 1 from public.effects where name = 'Booming Blade');
-- Disguise Self — 7 frames, 3440ms, sound: disguise_self.wav, voice: Frimousse
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Disguise Self', null, 3440, '[{"t_ms":0,"hex":"#B8D0E8","brightness":0.25,"fade_ms":450},{"t_ms":450,"hex":"#A8B8D8","brightness":0.38,"fade_ms":400},{"t_ms":850,"hex":"#9888C8","brightness":0.52,"fade_ms":400},{"t_ms":1250,"hex":"#8070C0","brightness":0.65,"fade_ms":530},{"t_ms":1780,"hex":"#B898E8","brightness":0.88,"fade_ms":180},{"t_ms":1960,"hex":"#9080D0","brightness":0.48,"fade_ms":280},{"t_ms":2240,"hex":"#888098","brightness":0.12,"fade_ms":1200}]'::jsonb, 3000, array['Frimousse']::text[]
where not exists (select 1 from public.effects where name = 'Disguise Self');
-- Haste — 8 frames, 3460ms, sound: haste.wav, voice: Véloce
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Haste', null, 3460, '[{"t_ms":0,"hex":"#FFE8A0","brightness":0.3,"fade_ms":400},{"t_ms":400,"hex":"#FFDA80","brightness":0.52,"fade_ms":500},{"t_ms":900,"hex":"#FFD040","brightness":0.72,"fade_ms":460},{"t_ms":1360,"hex":"#FFE680","brightness":0.94,"fade_ms":100},{"t_ms":1460,"hex":"#FFD040","brightness":0.78,"fade_ms":200},{"t_ms":1660,"hex":"#E8B020","brightness":0.55,"fade_ms":300},{"t_ms":1960,"hex":"#C89010","brightness":0.32,"fade_ms":500},{"t_ms":2460,"hex":"#8E6010","brightness":0.15,"fade_ms":1000}]'::jsonb, 3000, array['Véloce']::text[]
where not exists (select 1 from public.effects where name = 'Haste');
-- Acid Splash — 6 frames, 1990ms, sound: acid_splash.wav, voice: Acerbe
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Acid Splash', null, 1990, '[{"t_ms":0,"hex":"#88AA20","brightness":0.32,"fade_ms":300},{"t_ms":300,"hex":"#AABB30","brightness":0.58,"fade_ms":300},{"t_ms":600,"hex":"#BBDD30","brightness":0.78,"fade_ms":260},{"t_ms":860,"hex":"#CCFF33","brightness":0.92,"fade_ms":80},{"t_ms":940,"hex":"#668800","brightness":0.35,"fade_ms":400},{"t_ms":1340,"hex":"#334400","brightness":0.1,"fade_ms":650}]'::jsonb, 2000, array['Acerbe']::text[]
where not exists (select 1 from public.effects where name = 'Acid Splash');
-- Heat Metal — 9 frames, 3620ms, sound: heat_metal.wav, voice: Brasier
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Heat Metal', null, 3620, '[{"t_ms":0,"hex":"#6080A0","brightness":0.18,"fade_ms":450},{"t_ms":450,"hex":"#A88060","brightness":0.32,"fade_ms":400},{"t_ms":850,"hex":"#D06820","brightness":0.5,"fade_ms":350},{"t_ms":1200,"hex":"#FFAA00","brightness":0.88,"fade_ms":100},{"t_ms":1300,"hex":"#FF8500","brightness":0.72,"fade_ms":220},{"t_ms":1520,"hex":"#FF5500","brightness":0.55,"fade_ms":500},{"t_ms":2020,"hex":"#FF6800","brightness":0.78,"fade_ms":300},{"t_ms":2320,"hex":"#CC3300","brightness":0.5,"fade_ms":300},{"t_ms":2620,"hex":"#881800","brightness":0.2,"fade_ms":1000}]'::jsonb, 4000, array['Brasier']::text[]
where not exists (select 1 from public.effects where name = 'Heat Metal');
-- Faerie Fire — 8 frames, 3200ms, sound: faerie_fire.wav, voice: Féerie
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Faerie Fire', null, 3200, '[{"t_ms":0,"hex":"#B048DC","brightness":0.42,"fade_ms":400},{"t_ms":400,"hex":"#C040FF","brightness":0.65,"fade_ms":340},{"t_ms":740,"hex":"#D870FF","brightness":0.85,"fade_ms":260},{"t_ms":1000,"hex":"#E888FF","brightness":0.95,"fade_ms":100},{"t_ms":1100,"hex":"#C040FF","brightness":0.82,"fade_ms":200},{"t_ms":1300,"hex":"#A828EE","brightness":0.65,"fade_ms":300},{"t_ms":1600,"hex":"#8020D0","brightness":0.45,"fade_ms":600},{"t_ms":2200,"hex":"#5818A0","brightness":0.2,"fade_ms":1000}]'::jsonb, 4000, array['Féerie']::text[]
where not exists (select 1 from public.effects where name = 'Faerie Fire');
-- Ray of Frost — 6 frames, 2530ms, sound: ray_of_frost.wav, voice: Verglas
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Ray of Frost', null, 2530, '[{"t_ms":0,"hex":"#D8E8F8","brightness":0.22,"fade_ms":500},{"t_ms":500,"hex":"#B0D8F0","brightness":0.42,"fade_ms":500},{"t_ms":1000,"hex":"#88C8E8","brightness":0.65,"fade_ms":320},{"t_ms":1320,"hex":"#80CCFF","brightness":0.92,"fade_ms":80},{"t_ms":1400,"hex":"#60A8E8","brightness":0.3,"fade_ms":480},{"t_ms":1880,"hex":"#3080C0","brightness":0.1,"fade_ms":650}]'::jsonb, 2000, array['Verglas']::text[]
where not exists (select 1 from public.effects where name = 'Ray of Frost');
-- Wall of Fire — 10 frames, 6860ms, sound: wall_of_fire.wav, voice: Fournaise
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Wall of Fire', null, 6860, '[{"t_ms":0,"hex":"#5A1800","brightness":0.18,"fade_ms":500},{"t_ms":500,"hex":"#B04000","brightness":0.4,"fade_ms":600},{"t_ms":1100,"hex":"#E07020","brightness":0.62,"fade_ms":600},{"t_ms":1700,"hex":"#FF8500","brightness":0.78,"fade_ms":600},{"t_ms":2300,"hex":"#FF7000","brightness":0.88,"fade_ms":460},{"t_ms":2760,"hex":"#FFAA00","brightness":0.96,"fade_ms":100},{"t_ms":2860,"hex":"#FF7000","brightness":0.85,"fade_ms":500},{"t_ms":3360,"hex":"#FF5500","brightness":0.7,"fade_ms":800},{"t_ms":4160,"hex":"#E04000","brightness":0.48,"fade_ms":1400},{"t_ms":5560,"hex":"#A02000","brightness":0.22,"fade_ms":1300}]'::jsonb, 5000, array['Fournaise']::text[]
where not exists (select 1 from public.effects where name = 'Wall of Fire');
-- Finger of Death — 9 frames, 2860ms, sound: finger_of_death.wav, voice: Trépas
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Finger of Death', null, 2860, '[{"t_ms":0,"hex":"#003A14","brightness":0.18,"fade_ms":200},{"t_ms":200,"hex":"#006028","brightness":0.38,"fade_ms":300},{"t_ms":500,"hex":"#00903C","brightness":0.62,"fade_ms":260},{"t_ms":760,"hex":"#C8FFD8","brightness":0.95,"fade_ms":100},{"t_ms":860,"hex":"#00B040","brightness":0.62,"fade_ms":200},{"t_ms":1060,"hex":"#006028","brightness":0.4,"fade_ms":300},{"t_ms":1360,"hex":"#003020","brightness":0.22,"fade_ms":400},{"t_ms":1760,"hex":"#001810","brightness":0.1,"fade_ms":500},{"t_ms":2260,"hex":"#000800","brightness":0.04,"fade_ms":600}]'::jsonb, 3000, array['Trépas']::text[]
where not exists (select 1 from public.effects where name = 'Finger of Death');
-- Disintegrate — 10 frames, 4540ms, sound: disintegrate.wav, voice: Néant
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Disintegrate', null, 4540, '[{"t_ms":0,"hex":"#803000","brightness":0.22,"fade_ms":600},{"t_ms":600,"hex":"#C04800","brightness":0.45,"fade_ms":650},{"t_ms":1250,"hex":"#F06400","brightness":0.65,"fade_ms":650},{"t_ms":1900,"hex":"#FF7800","brightness":0.82,"fade_ms":620},{"t_ms":2520,"hex":"#FFAA40","brightness":0.98,"fade_ms":100},{"t_ms":2620,"hex":"#FF8C00","brightness":0.82,"fade_ms":200},{"t_ms":2820,"hex":"#C86820","brightness":0.6,"fade_ms":220},{"t_ms":3040,"hex":"#7A6050","brightness":0.38,"fade_ms":300},{"t_ms":3340,"hex":"#4A4845","brightness":0.18,"fade_ms":400},{"t_ms":3740,"hex":"#2A2825","brightness":0.06,"fade_ms":800}]'::jsonb, 2000, array['Néant']::text[]
where not exists (select 1 from public.effects where name = 'Disintegrate');
-- Blight — 5 frames, 3090ms, sound: blight.wav, voice: Flétrissure
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Blight', null, 3090, '[{"t_ms":0,"hex":"#7A6010","brightness":0.4,"fade_ms":60},{"t_ms":60,"hex":"#A88018","brightness":0.58,"fade_ms":80},{"t_ms":140,"hex":"#5A3800","brightness":0.32,"fade_ms":450},{"t_ms":590,"hex":"#2A1800","brightness":0.14,"fade_ms":900},{"t_ms":1490,"hex":"#1A0F00","brightness":0.05,"fade_ms":1600}]'::jsonb, 4000, array['Flétrissure']::text[]
where not exists (select 1 from public.effects where name = 'Blight');
-- Mass Healing Word — 9 frames, 5840ms, sound: mass_healing_word.wav, voice: Cantique
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Mass Healing Word', null, 5840, '[{"t_ms":0,"hex":"#FFF1C8","brightness":0.22,"fade_ms":400},{"t_ms":400,"hex":"#FFE9A8","brightness":0.42,"fade_ms":300},{"t_ms":700,"hex":"#FFD46A","brightness":0.62,"fade_ms":340},{"t_ms":1040,"hex":"#FFC640","brightness":0.78,"fade_ms":300},{"t_ms":1340,"hex":"#FFE680","brightness":0.95,"fade_ms":100},{"t_ms":1440,"hex":"#FFD46A","brightness":0.78,"fade_ms":300},{"t_ms":1740,"hex":"#FFE9A8","brightness":0.55,"fade_ms":600},{"t_ms":2340,"hex":"#FFF1C8","brightness":0.35,"fade_ms":1000},{"t_ms":3340,"hex":"#FFE8A8","brightness":0.15,"fade_ms":2500}]'::jsonb, 4000, array['Cantique']::text[]
where not exists (select 1 from public.effects where name = 'Mass Healing Word');
-- Arcane Shot — 6 frames, 2360ms, sound: arcane_shot.wav, voice: Décharge
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Arcane Shot', null, 2360, '[{"t_ms":0,"hex":"#5C0808","brightness":0.22,"fade_ms":400},{"t_ms":400,"hex":"#903030","brightness":0.45,"fade_ms":500},{"t_ms":900,"hex":"#C04040","brightness":0.68,"fade_ms":380},{"t_ms":1280,"hex":"#FFE0E0","brightness":0.98,"fade_ms":80},{"t_ms":1360,"hex":"#900808","brightness":0.4,"fade_ms":400},{"t_ms":1760,"hex":"#400404","brightness":0.1,"fade_ms":600}]'::jsonb, 2000, array['Décharge']::text[]
where not exists (select 1 from public.effects where name = 'Arcane Shot');
-- Wild Shape — 7 frames, 3440ms, sound: wild_shape.wav, voice: Sauvagine
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Wild Shape', null, 3440, '[{"t_ms":0,"hex":"#2A4A20","brightness":0.22,"fade_ms":450},{"t_ms":450,"hex":"#387028","brightness":0.42,"fade_ms":400},{"t_ms":850,"hex":"#44A038","brightness":0.62,"fade_ms":400},{"t_ms":1250,"hex":"#66CC44","brightness":0.78,"fade_ms":530},{"t_ms":1780,"hex":"#98FF50","brightness":0.95,"fade_ms":180},{"t_ms":1960,"hex":"#226622","brightness":0.38,"fade_ms":280},{"t_ms":2240,"hex":"#112211","brightness":0.1,"fade_ms":1200}]'::jsonb, 3000, array['Sauvagine']::text[]
where not exists (select 1 from public.effects where name = 'Wild Shape');
-- Bludgeon — 6 frames, 2020ms, sound: bludgeon.wav, voice: Boutez
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Bludgeon', null, 2020, '[{"t_ms":0,"hex":"#6A6A6A","brightness":0.25,"fade_ms":400},{"t_ms":400,"hex":"#A8A8A8","brightness":0.5,"fade_ms":300},{"t_ms":700,"hex":"#C0C0C0","brightness":0.72,"fade_ms":380},{"t_ms":1080,"hex":"#FF0033","brightness":0.95,"fade_ms":80},{"t_ms":1160,"hex":"#888888","brightness":0.38,"fade_ms":360},{"t_ms":1520,"hex":"#383838","brightness":0.1,"fade_ms":500}]'::jsonb, 1000, array['Boutez']::text[]
where not exists (select 1 from public.effects where name = 'Bludgeon');
-- Slash — 5 frames, 850ms, sound: slash.wav, voice: Taillade
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Slash', null, 850, '[{"t_ms":0,"hex":"#888888","brightness":0.4,"fade_ms":40},{"t_ms":40,"hex":"#FFFFFF","brightness":0.95,"fade_ms":60},{"t_ms":100,"hex":"#FF0033","brightness":0.9,"fade_ms":80},{"t_ms":180,"hex":"#888888","brightness":0.28,"fade_ms":220},{"t_ms":400,"hex":"#383838","brightness":0.08,"fade_ms":450}]'::jsonb, 1000, array['Taillade']::text[]
where not exists (select 1 from public.effects where name = 'Slash');
-- Pierce — 7 frames, 2050ms, sound: pierce.wav, voice: Estoc
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Pierce', null, 2050, '[{"t_ms":0,"hex":"#6A6A6A","brightness":0.25,"fade_ms":400},{"t_ms":400,"hex":"#A0A0A0","brightness":0.55,"fade_ms":400},{"t_ms":800,"hex":"#D0D0D0","brightness":0.75,"fade_ms":340},{"t_ms":1140,"hex":"#FFFFFF","brightness":0.92,"fade_ms":80},{"t_ms":1220,"hex":"#FF0033","brightness":0.98,"fade_ms":80},{"t_ms":1300,"hex":"#888888","brightness":0.28,"fade_ms":300},{"t_ms":1600,"hex":"#383838","brightness":0.08,"fade_ms":450}]'::jsonb, 1000, array['Estoc']::text[]
where not exists (select 1 from public.effects where name = 'Pierce');
-- Spider Bite — 4 frames, 1350ms, sound: spider_bite.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Spider Bite', null, 1350, '[{"t_ms":0,"hex":"#226A18","brightness":0.32,"fade_ms":300},{"t_ms":300,"hex":"#44FF00","brightness":0.85,"fade_ms":80},{"t_ms":380,"hex":"#114400","brightness":0.22,"fade_ms":420},{"t_ms":800,"hex":"#081A00","brightness":0.06,"fade_ms":550}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Spider Bite');
-- Worm Surge — 11 frames, 5040ms, sound: worm_surge.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Worm Surge', null, 5040, '[{"t_ms":0,"hex":"#2A1800","brightness":0.15,"fade_ms":400},{"t_ms":400,"hex":"#5C3D20","brightness":0.32,"fade_ms":450},{"t_ms":850,"hex":"#7A4A28","brightness":0.55,"fade_ms":450},{"t_ms":1300,"hex":"#8B5828","brightness":0.68,"fade_ms":400},{"t_ms":1700,"hex":"#6A3878","brightness":0.82,"fade_ms":100},{"t_ms":1800,"hex":"#7A4A28","brightness":0.62,"fade_ms":200},{"t_ms":2000,"hex":"#5C3018","brightness":0.42,"fade_ms":300},{"t_ms":2300,"hex":"#3A2010","brightness":0.2,"fade_ms":1540},{"t_ms":3840,"hex":"#5A3020","brightness":0.45,"fade_ms":300},{"t_ms":4140,"hex":"#3A2010","brightness":0.2,"fade_ms":400},{"t_ms":4540,"hex":"#1F1008","brightness":0.06,"fade_ms":500}]'::jsonb, 3000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Worm Surge');
-- Crystal Breath — 5 frames, 2200ms, sound: crystal_breath.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Crystal Breath', null, 2200, '[{"t_ms":0,"hex":"#88CCEE","brightness":0.52,"fade_ms":400},{"t_ms":400,"hex":"#EEFFFF","brightness":0.98,"fade_ms":80},{"t_ms":480,"hex":"#66B8E8","brightness":0.52,"fade_ms":320},{"t_ms":800,"hex":"#2266AA","brightness":0.2,"fade_ms":500},{"t_ms":1300,"hex":"#224466","brightness":0.06,"fade_ms":900}]'::jsonb, 3000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Crystal Breath');
-- Dragon Bite — 4 frames, 1050ms, sound: dragon_bite.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Dragon Bite', null, 1050, '[{"t_ms":0,"hex":"#2A0808","brightness":0.2,"fade_ms":40},{"t_ms":40,"hex":"#CC3300","brightness":0.88,"fade_ms":60},{"t_ms":100,"hex":"#550000","brightness":0.28,"fade_ms":300},{"t_ms":400,"hex":"#1A0000","brightness":0.06,"fade_ms":650}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Dragon Bite');
-- Hammer Slam — 7 frames, 2750ms, sound: hammer_slam.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Hammer Slam', null, 2750, '[{"t_ms":0,"hex":"#2A488A","brightness":0.22,"fade_ms":400},{"t_ms":400,"hex":"#4488FF","brightness":0.5,"fade_ms":400},{"t_ms":800,"hex":"#88BBFF","brightness":0.72,"fade_ms":460},{"t_ms":1260,"hex":"#DDEEFF","brightness":0.98,"fade_ms":80},{"t_ms":1340,"hex":"#2266FF","brightness":0.52,"fade_ms":360},{"t_ms":1700,"hex":"#001888","brightness":0.18,"fade_ms":550},{"t_ms":2250,"hex":"#000A40","brightness":0.06,"fade_ms":500}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Hammer Slam');
-- Ignite — 4 frames, 990ms, sound: ignite.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Ignite', null, 990, '[{"t_ms":0,"hex":"#FF6600","brightness":0.55,"fade_ms":40},{"t_ms":40,"hex":"#FFAA00","brightness":0.92,"fade_ms":80},{"t_ms":120,"hex":"#CC4400","brightness":0.35,"fade_ms":320},{"t_ms":440,"hex":"#5A1000","brightness":0.06,"fade_ms":550}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Ignite');
-- Gust — 8 frames, 6400ms, sound: gust.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Gust', null, 6400, '[{"t_ms":0,"hex":"#C0D8F0","brightness":0.25,"fade_ms":1200},{"t_ms":1200,"hex":"#D8E8F8","brightness":0.45,"fade_ms":1200},{"t_ms":2400,"hex":"#EEF4FF","brightness":0.62,"fade_ms":1200},{"t_ms":3600,"hex":"#F8FCFF","brightness":0.8,"fade_ms":1200},{"t_ms":4800,"hex":"#FFFFFF","brightness":0.92,"fade_ms":100},{"t_ms":4900,"hex":"#DDEEFF","brightness":0.65,"fade_ms":300},{"t_ms":5200,"hex":"#BBDDFF","brightness":0.38,"fade_ms":400},{"t_ms":5600,"hex":"#88AADD","brightness":0.15,"fade_ms":800}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Gust');
-- Spore Burst — 8 frames, 3000ms, sound: spore_burst.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Spore Burst', null, 3000, '[{"t_ms":0,"hex":"#224028","brightness":0.22,"fade_ms":300},{"t_ms":300,"hex":"#5C4040","brightness":0.42,"fade_ms":320},{"t_ms":620,"hex":"#8870A8","brightness":0.65,"fade_ms":380},{"t_ms":1000,"hex":"#D8A8FF","brightness":0.92,"fade_ms":100},{"t_ms":1100,"hex":"#A878D0","brightness":0.65,"fade_ms":200},{"t_ms":1300,"hex":"#786088","brightness":0.42,"fade_ms":400},{"t_ms":1700,"hex":"#4A5030","brightness":0.25,"fade_ms":500},{"t_ms":2200,"hex":"#1F3015","brightness":0.08,"fade_ms":800}]'::jsonb, 3000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Spore Burst');
-- Flask Shatter — 5 frames, 1550ms, sound: flask_shatter.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Flask Shatter', null, 1550, '[{"t_ms":0,"hex":"#88AA20","brightness":0.48,"fade_ms":40},{"t_ms":40,"hex":"#CCFF66","brightness":0.92,"fade_ms":80},{"t_ms":120,"hex":"#88DD00","brightness":0.45,"fade_ms":280},{"t_ms":400,"hex":"#446600","brightness":0.2,"fade_ms":500},{"t_ms":900,"hex":"#223300","brightness":0.06,"fade_ms":650}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Flask Shatter');
-- Steam Blast — 5 frames, 2070ms, sound: steam_blast.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Steam Blast', null, 2070, '[{"t_ms":0,"hex":"#D8D8D8","brightness":0.52,"fade_ms":240},{"t_ms":240,"hex":"#FFFFFF","brightness":0.95,"fade_ms":80},{"t_ms":320,"hex":"#F0F0F0","brightness":0.6,"fade_ms":300},{"t_ms":620,"hex":"#C8C8C8","brightness":0.26,"fade_ms":550},{"t_ms":1170,"hex":"#A0A0A0","brightness":0.08,"fade_ms":900}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Steam Blast');
-- Arcane Surge — 10 frames, 6560ms, sound: arcane_surge.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Arcane Surge', null, 6560, '[{"t_ms":0,"hex":"#4A4A50","brightness":0.18,"fade_ms":800},{"t_ms":800,"hex":"#8A8A8A","brightness":0.35,"fade_ms":1000},{"t_ms":1800,"hex":"#C0C0C0","brightness":0.55,"fade_ms":1000},{"t_ms":2800,"hex":"#E8D080","brightness":0.7,"fade_ms":900},{"t_ms":3700,"hex":"#F8E090","brightness":0.85,"fade_ms":560},{"t_ms":4260,"hex":"#FFFFFF","brightness":0.98,"fade_ms":100},{"t_ms":4360,"hex":"#E8D080","brightness":0.75,"fade_ms":200},{"t_ms":4560,"hex":"#A09050","brightness":0.5,"fade_ms":300},{"t_ms":4860,"hex":"#705030","brightness":0.22,"fade_ms":500},{"t_ms":5360,"hex":"#3A2810","brightness":0.08,"fade_ms":1200}]'::jsonb, 3000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Arcane Surge');
-- Sand Blast — 5 frames, 1420ms, sound: sand_blast.wav
insert into public.effects (name, sound_path, duration_ms, frames, revert_ms, trigger_words)
select 'Sand Blast', null, 1420, '[{"t_ms":0,"hex":"#886020","brightness":0.32,"fade_ms":220},{"t_ms":220,"hex":"#C08840","brightness":0.65,"fade_ms":200},{"t_ms":420,"hex":"#FFD080","brightness":0.92,"fade_ms":80},{"t_ms":500,"hex":"#A07030","brightness":0.38,"fade_ms":320},{"t_ms":820,"hex":"#704A1A","brightness":0.1,"fade_ms":600}]'::jsonb, 2000, '{}'::text[]
where not exists (select 1 from public.effects where name = 'Sand Blast');


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

    -- Indoor Locations
    select id into fid from public.folders
    where owner_id = target and name = 'Indoor Locations' and kind = 'scene';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Indoor Locations', 'scene', 0)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'scene', t.id, t.ord
    from (
      select s.id, x.ord
      from unnest(array['Dueling Club','Noble House','Detective Office','Curio Shop','Newspaper','Tavern','Ballroom']) with ordinality as x(nm, ord)
      join public.scenes s
        on s.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Outdoor & Depths
    select id into fid from public.folders
    where owner_id = target and name = 'Outdoor & Depths' and kind = 'scene';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Outdoor & Depths', 'scene', 1)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'scene', t.id, t.ord
    from (
      select s.id, x.ord
      from unnest(array['Ironbottom Riots','Ironbottom Neutral','Ironbottom Night','Mine','Factory','Dream Sequence']) with ordinality as x(nm, ord)
      join public.scenes s
        on s.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Combat
    select id into fid from public.folders
    where owner_id = target and name = 'Combat' and kind = 'scene';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Combat', 'scene', 2)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'scene', t.id, t.ord
    from (
      select s.id, x.ord
      from unnest(array['Combat 1','Combat 2','Combat 3','Combat 4','Victory']) with ordinality as x(nm, ord)
      join public.scenes s
        on s.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Ambient
    select id into fid from public.folders
    where owner_id = target and name = 'Ambient' and kind = 'scene';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Ambient', 'scene', 3)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'scene', t.id, t.ord
    from (
      select s.id, x.ord
      from unnest(array['Base 1','Base 2','Base 3','Base 4']) with ordinality as x(nm, ord)
      join public.scenes s
        on s.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Offensive
    select id into fid from public.folders
    where owner_id = target and name = 'Offensive' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Offensive', 'effect', 4)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Fireball','Eldritch Blast','Ice Knife','Lightning Bolt','Firebolt','Magic Missile','Acid Splash','Ray of Frost','Booming Blade']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Elemental
    select id into fid from public.folders
    where owner_id = target and name = 'Elemental' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Elemental', 'effect', 5)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Water Whip','Heat Metal','Wall of Fire','Faerie Fire']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Necrotic
    select id into fid from public.folders
    where owner_id = target and name = 'Necrotic' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Necrotic', 'effect', 6)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Blight','Finger of Death','Disintegrate']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Healing & Support
    select id into fid from public.folders
    where owner_id = target and name = 'Healing & Support' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Healing & Support', 'effect', 7)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Cure Wounds','Mass Healing Word','Haste','Light']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Defense
    select id into fid from public.folders
    where owner_id = target and name = 'Defense' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Defense', 'effect', 8)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Shield','Mage Armor','Private Sanctum']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Utility
    select id into fid from public.folders
    where owner_id = target and name = 'Utility' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Utility', 'effect', 9)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Prestidigitation','Disguise Self','Misty Step']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- PC Combat
    select id into fid from public.folders
    where owner_id = target and name = 'PC Combat' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'PC Combat', 'effect', 10)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Arcane Shot','Wild Shape','Bludgeon','Slash','Pierce']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Creatures
    select id into fid from public.folders
    where owner_id = target and name = 'Creatures' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Creatures', 'effect', 11)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Spider Bite','Dragon Bite','Worm Surge','Crystal Breath']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

    -- Magical & Environmental
    select id into fid from public.folders
    where owner_id = target and name = 'Magical & Environmental' and kind = 'effect';

    if fid is null then
      insert into public.folders (owner_id, name, kind, position)
      values (target, 'Magical & Environmental', 'effect', 12)
      returning id into fid;
    end if;

    insert into public.folder_items (owner_id, folder_id, kind, item_id, position)
    select target, fid, 'effect', t.id, t.ord
    from (
      select e.id, x.ord
      from unnest(array['Hammer Slam','Arcane Surge','Ignite','Gust','Sand Blast','Steam Blast','Spore Burst','Flask Shatter']) with ordinality as x(nm, ord)
      join public.effects e
        on e.name = x.nm
    ) t
    on conflict (owner_id, folder_id, kind, item_id) do nothing;

  raise notice 'Folders created for %', target;
end $$;

