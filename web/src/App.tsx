import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { api } from './lib/api';
import * as db from './lib/data';
import { Auth } from './components/Auth';
import { Connections } from './components/Connections';
import { GeneralTab } from './tabs/GeneralTab';
import { ScenesTab } from './tabs/ScenesTab';
import { EffectsTab } from './tabs/EffectsTab';
import { joinParty, type PartyMember } from './lib/realtime';
import { applyLight, getCachedSound, loadSound, runEffect, setAmbient, unlockAudio } from './lib/sequencer';
import { pause, playContext } from './lib/spotify';
import type { Effect, PartyEvent, Scene } from './lib/types';

type Tab = 'general' | 'scenes' | 'effects';

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

  if (!ready) return null;
  if (!session) return <Auth />;

  // Remount everything on user change so no state leaks between accounts.
  return <Party key={session.user.id} session={session} />;
}

function Party({ session }: { session: Session }) {
  const userId = session.user.id;

  const [tab, setTab] = useState<Tab>('general');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [displayName, setDisplayName] = useState('Adventurer');
  const [showConnections, setShowConnections] = useState(false);
  const [connected, setConnected] = useState<{ lifx: boolean; spotify: boolean } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState('CONNECTING');

  const sendRef = useRef<((e: PartyEvent) => void) | null>(null);

  // ---- Data loading -------------------------------------------------------

  const reloadScenes = useCallback(async () => setScenes(await db.listScenes()), []);
  const reloadEffects = useCallback(async () => setEffects(await db.listEffects()), []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([reloadScenes(), reloadEffects()]);
        const profiles = await db.listProfiles();
        setDisplayName(profiles.find((p) => p.id === userId)?.display_name ?? 'Adventurer');
      } catch (err) {
        setBanner((err as Error).message);
      }
    })();
  }, [reloadScenes, reloadEffects, userId]);

  // Nudge people through setup — nothing works without these two.
  useEffect(() => {
    void api
      .status()
      .then((s) => {
        setConnected(s);
        if (!s.lifx) setShowConnections(true);
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
  // Decoding at trigger time would blow the timing budget, so every effect's
  // audio is fetched and decoded up front and held in memory.

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

  // Held in a ref so the realtime subscription below can stay mounted for the
  // life of the session while still seeing current scenes/effects.
  const handleEvent = useCallback(
    (event: PartyEvent) => {
      switch (event.type) {
        case 'light': {
          setAmbient({
            hex: event.hex,
            brightness: event.brightness,
            durationMs: event.durationMs,
          });
          void applyLight(
            { hex: event.hex, brightness: event.brightness, durationMs: event.durationMs },
            event.power,
          );
          break;
        }

        case 'scene': {
          const scene = scenes.find((s) => s.id === event.sceneId);
          if (!scene) return;

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

          runEffect(effect, getCachedSound(effect.id), { startDelayMs: event.leadMs });
          break;
        }

        case 'music': {
          if (event.contextUri) {
            playContext(event.contextUri).catch((err) =>
              setBanner(`Spotify: ${(err as Error).message}`),
            );
          } else {
            void pause();
          }
          break;
        }
      }
    },
    [scenes, effects],
  );

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
        <span className="brand">Party of Effects</span>

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

          {connected && !connected.lifx && (
            <span className="pill" style={{ borderColor: 'var(--danger)' }}>
              LIFX not connected
            </span>
          )}

          <button className="btn secondary sm" onClick={() => setShowConnections(true)}>
            {displayName}
          </button>
        </div>
      </header>

      {banner && (
        <div
          className="row"
          style={{
            background: 'var(--bg-input)',
            borderBottom: '1px solid var(--border)',
            padding: '8px 20px',
            fontSize: 12.5,
          }}
        >
          <span style={{ flex: 1 }}>{banner}</span>
          <button className="chip-x" onClick={() => setBanner(null)}>
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

      {showConnections && <Connections onClose={() => setShowConnections(false)} />}
    </div>
  );
}
