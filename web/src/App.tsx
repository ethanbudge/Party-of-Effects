import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { api } from './lib/api';
import * as db from './lib/data';
import { Auth } from './components/Auth';
import { Connections } from './components/Connections';
import { NowPlaying } from './components/NowPlaying';
import { GeneralTab } from './tabs/GeneralTab';
import { ScenesTab } from './tabs/ScenesTab';
import { EffectsTab } from './tabs/EffectsTab';
import { joinParty, type PartyMember } from './lib/realtime';
import {
  applyLight,
  getCachedSound,
  loadSound,
  runEffect,
  setAmbient,
  setLightProfile,
  unlockAudio,
} from './lib/sequencer';
import { pause, playContext } from './lib/spotify';
import type { Effect, PartyEvent, Scene, UserSettings } from './lib/types';

type Tab = 'general' | 'scenes' | 'effects';
type Theme = 'dark' | 'light';

const THEME_KEY = 'poe.theme';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Theme lives at the root so it applies to the auth screen too.
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  if (!ready) return null;
  if (!session) return <Auth />;

  // Remount everything on user change so no state leaks between accounts.
  return (
    <Party
      key={session.user.id}
      session={session}
      theme={theme}
      onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    />
  );
}

function Party({
  session,
  theme,
  onToggleTheme,
}: {
  session: Session;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const userId = session.user.id;

  const [tab, setTab] = useState<Tab>('general');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [displayName, setDisplayName] = useState('Adventurer');
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState<{ lifx: boolean; spotify: boolean } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState('CONNECTING');
  const [settings, setSettings] = useState<UserSettings>({
    user_id: userId,
    max_brightness: 1,
    light_ids: null,
  });
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [activeEffect, setActiveEffect] = useState<Effect | null>(null);

  const sendRef = useRef<((e: PartyEvent) => void) | null>(null);
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Data loading -------------------------------------------------------

  const reloadScenes = useCallback(async () => setScenes(await db.listScenes()), []);
  const reloadEffects = useCallback(async () => setEffects(await db.listEffects()), []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([reloadScenes(), reloadEffects()]);
        const profiles = await db.listProfiles();
        setDisplayName(profiles.find((p) => p.id === userId)?.display_name ?? 'Adventurer');
        setSettings(await db.getSettings(userId));
      } catch (err) {
        setBanner((err as Error).message);
      }
    })();
  }, [reloadScenes, reloadEffects, userId]);

  // Push settings into the sequencer, which applies them to every light command.
  useEffect(() => {
    setLightProfile({
      maxBrightness: settings.max_brightness,
      selector: db.lightSelector(settings.light_ids),
    });
  }, [settings]);

  useEffect(() => {
    void api
      .status()
      .then((s) => {
        setConnected(s);
        if (!s.lifx) setShowSettings(true);
      })
      .catch(() => setConnected({ lifx: false, spotify: false }));
  }, []);

  // Spotify bounces back here after OAuth.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('spotify');
    if (!result) return;

    setBanner(
      result === 'connected' ? 'Spotify connected.' : `Spotify connection failed: ${result}`,
    );
    window.history.replaceState({}, '', window.location.pathname);
    void api.status().then(setConnected).catch(() => {});
  }, []);

  // ---- Sound preloading ---------------------------------------------------
  useEffect(() => {
    for (const effect of effects) {
      if (!effect.sound_path || getCachedSound(effect.id)) continue;
      void db
        .soundUrl(effect.sound_path)
        .then((url) => loadSound(effect.id, url))
        .catch((err) => console.warn(`[preload] ${effect.name}:`, err));
    }
  }, [effects]);

  // ---- Party events -------------------------------------------------------

  const handleEvent = useCallback(
    (event: PartyEvent) => {
      switch (event.type) {
        case 'light': {
          setAmbient({
            hex: event.hex,
            brightness: event.brightness,
            durationMs: event.durationMs,
          });
          setActiveScene(null);
          void applyLight(
            { hex: event.hex, brightness: event.brightness, durationMs: event.durationMs },
            event.power,
          );
          break;
        }

        case 'scene': {
          const scene = scenes.find((s) => s.id === event.sceneId);
          if (!scene) return;

          setActiveScene(scene);
          setAmbient({ hex: scene.hex, brightness: scene.brightness, durationMs: 1500 });
          void applyLight({ hex: scene.hex, brightness: scene.brightness, durationMs: 1500 });

          if (scene.playlist_uri) {
            playContext(scene.playlist_uri).catch((err) =>
              setBanner(`Spotify: ${(err as Error).message}`),
            );
          }
          break;
        }

        case 'effect': {
          const effect = effects.find((e) => e.id === event.effectId);
          if (!effect) return;

          setActiveEffect(effect);
          if (effectTimer.current) clearTimeout(effectTimer.current);
          effectTimer.current = setTimeout(
            () => setActiveEffect(null),
            event.leadMs + effect.duration_ms + effect.revert_ms + 500,
          );

          runEffect(effect, getCachedSound(effect.id), { startDelayMs: event.leadMs });
          break;
        }

        case 'music': {
          const fail = (err: unknown) => setBanner(`Spotify: ${(err as Error).message}`);
          switch (event.action) {
            case 'play':
              if (event.contextUri) playContext(event.contextUri).catch(fail);
              break;
            case 'pause':
              pause().catch(fail);
              break;
            case 'resume':
              api.spotifyResume().catch(fail);
              break;
            case 'next':
              api.spotifyNext().catch(fail);
              break;
            case 'previous':
              api.spotifyPrevious().catch(fail);
              break;
          }
          break;
        }
      }
    },
    [scenes, effects],
  );

  // Held in a ref so the realtime subscription can stay mounted for the life of
  // the session while still seeing current scenes/effects.
  const handlerRef = useRef(handleEvent);
  handlerRef.current = handleEvent;

  // ---- Realtime -----------------------------------------------------------

  useEffect(() => {
    const party = joinParty({
      userId,
      displayName,
      onEvent: (e) => handlerRef.current(e),
      onMembers: setMembers,
      onStatus: setChannelStatus,
    });

    sendRef.current = party.send;
    return () => {
      sendRef.current = null;
      party.leave();
    };
  }, [userId, displayName]);

  const send = useCallback((event: PartyEvent) => {
    // Browsers block audio until a user gesture; every send is one.
    void unlockAudio();
    sendRef.current?.(event);
  }, []);

  // ---- Render -------------------------------------------------------------

  const live = channelStatus === 'SUBSCRIBED';

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          Party of <span>Effects</span>
        </span>

        <nav className="tabs">
          {(['general', 'scenes', 'effects'] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? 'tab active' : 'tab'}
              onClick={() => {
                void unlockAudio();
                setTab(t);
              }}
            >
              {t === 'general' ? 'General' : t === 'scenes' ? 'Scenes' : 'Effects'}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="presence" title={members.map((m) => m.displayName).join(', ')}>
            <span className={live ? 'dot' : 'dot off'} />
            {live ? `${members.length} online` : 'connecting…'}
          </span>

          {connected && !connected.lifx && <span className="pill warn">LIFX not connected</span>}

          {settings.max_brightness < 1 && (
            <span className="pill" title="Your personal brightness cap">
              cap {Math.round(settings.max_brightness * 100)}%
            </span>
          )}

          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to the cream theme' : 'Switch to the dark theme'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <button className="btn secondary sm" onClick={() => setShowSettings(true)}>
            {displayName}
          </button>
        </div>
      </header>

      {banner && (
        <div className="banner">
          <span style={{ flex: 1 }}>{banner}</span>
          <button className="icon-btn" onClick={() => setBanner(null)}>
            ✕
          </button>
        </div>
      )}

      <main className="content">
        {tab === 'general' && (
          <GeneralTab send={send} members={members} displayName={displayName} />
        )}
        {tab === 'scenes' && (
          <ScenesTab
            scenes={scenes}
            reloadScenes={reloadScenes}
            userId={userId}
            displayName={displayName}
            send={send}
          />
        )}
        {tab === 'effects' && (
          <EffectsTab
            effects={effects}
            reloadEffects={reloadEffects}
            userId={userId}
            displayName={displayName}
            send={send}
          />
        )}
      </main>

      <NowPlaying
        scene={activeScene}
        effect={activeEffect}
        send={send}
        displayName={displayName}
      />

      {showSettings && (
        <Connections
          userId={userId}
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
