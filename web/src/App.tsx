import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { api } from './lib/api';
import * as db from './lib/data';
import { Auth } from './components/Auth';
import { Connections } from './components/Connections';
import { GroupSwitcher } from './components/GroupSwitcher';
import { GroupManager } from './components/GroupManager';
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
import { bindingsFrom, startListening, type VoiceHandle, type VoiceStatus } from './lib/voice';
import type { Effect, Group, GroupId, PartyEvent, Scene, UserSettings } from './lib/types';

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
    voice_enabled: false,
    voice_language: 'en-US',
    voice_allow_cloud: false,
    active_group_id: null,
  });
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [activeEffect, setActiveEffect] = useState<Effect | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showGroups, setShowGroups] = useState(false);

  // The library on screen. Null is solo: private content, no live channel.
  const [groupId, setGroupId] = useState<GroupId>(null);
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  const sendRef = useRef<((e: PartyEvent) => void) | null>(null);
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRef = useRef<VoiceHandle | null>(null);

  // ---- Data loading -------------------------------------------------------

  const reloadScenes = useCallback(async () => setScenes(await db.listScenes(groupId)), [groupId]);
  const reloadEffects = useCallback(
    async () => setEffects(await db.listEffects(groupId)),
    [groupId],
  );

  const reloadGroups = useCallback(async () => {
    const { groups } = await api.listGroups();
    setGroups(groups);
    return groups;
  }, []);

  // Groups and the last-used one load first, because which library to fetch
  // depends on the answer.
  useEffect(() => {
    void (async () => {
      try {
        const [profiles, saved, mine] = await Promise.all([
          db.listProfiles(),
          db.getSettings(userId),
          reloadGroups(),
        ]);
        setDisplayName(profiles.find((p) => p.id === userId)?.display_name ?? 'Adventurer');
        setSettings(saved);

        // Fall back to solo if the remembered group is gone — deleted, or you
        // were removed from it.
        const restored = mine.some((g) => g.id === saved.active_group_id)
          ? saved.active_group_id
          : null;
        setGroupId(restored);
      } catch (err) {
        setBanner((err as Error).message);
      } finally {
        setGroupsLoaded(true);
      }
    })();
  }, [userId, reloadGroups]);

  // Content follows the active group. Cleared first so a slow fetch can never
  // leave one group's effects visible while another group's name is shown.
  useEffect(() => {
    if (!groupsLoaded) return;
    setScenes([]);
    setEffects([]);
    setActiveScene(null);
    setActiveEffect(null);
    void Promise.all([reloadScenes(), reloadEffects()]).catch((err) =>
      setBanner((err as Error).message),
    );
  }, [groupsLoaded, groupId, reloadScenes, reloadEffects]);

  const switchGroup = useCallback(
    (next: GroupId) => {
      setGroupId(next);
      void db.saveSettings(userId, { active_group_id: next }).catch(() => {});
    },
    [userId],
  );

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

          // Our own speakers are about to play this sound. Stop listening for
          // its duration so the effect audio cannot trigger another effect.
          voiceRef.current?.suppressFor(event.leadMs + effect.duration_ms + 600);

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

  // Solo mode has no channel at all: nothing to broadcast to, and nothing that
  // could reach you. Joining a group is what opens the door, in both directions.
  useEffect(() => {
    if (!groupId) {
      sendRef.current = null;
      setMembers([]);
      setChannelStatus('SOLO');
      return;
    }

    const party = joinParty({
      groupId,
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
  }, [groupId, userId, displayName]);

  // ---- Voice ---------------------------------------------------------------
  // Rebuilt only when the switch, language, or cloud permission changes.
  // Trigger words are pushed in separately so editing an effect never drops
  // the microphone.
  useEffect(() => {
    if (!settings.voice_enabled) {
      voiceRef.current?.stop();
      voiceRef.current = null;
      setVoiceStatus('idle');
      return;
    }

    const handle = startListening({
      lang: settings.voice_language,
      processLocally: !settings.voice_allow_cloud,
      bindings: [],
      onStatus: (s, detail) => {
        setVoiceStatus(s);
        if (detail && (s === 'denied' || s === 'error')) setBanner(`Voice: ${detail}`);
      },
      onHeard: setLastHeard,
      onMatch: (binding) => {
        setBanner(`Voice: ${binding.name}`);
        send({ type: 'effect', effectId: binding.effectId, leadMs: 400, by: displayName });
      },
    });

    voiceRef.current = handle;
    return () => {
      handle.stop();
      voiceRef.current = null;
    };
    // `send` and `displayName` are stable enough for the session; including
    // them would tear the microphone down on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.voice_enabled, settings.voice_language, settings.voice_allow_cloud]);

  // Keep the trigger list current without restarting recognition.
  useEffect(() => {
    voiceRef.current?.setBindings(bindingsFrom(effects));
  }, [effects, voiceStatus]);

  const send = useCallback((event: PartyEvent) => {
    // Browsers block audio until a user gesture; every send is one.
    void unlockAudio();

    if (sendRef.current) {
      sendRef.current(event);
    } else {
      // Solo: no channel, so act on it directly. Same handler either way, so an
      // effect behaves identically whether or not anyone else is listening.
      handlerRef.current(event);
    }
  }, []);

  // ---- Render -------------------------------------------------------------

  const live = channelStatus === 'SUBSCRIBED';

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          Party of <span>Effects</span>
        </span>

        <GroupSwitcher
          groups={groups}
          activeGroupId={groupId}
          memberCount={members.length}
          onSwitch={switchGroup}
          onManage={() => setShowGroups(true)}
        />

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
            {!groupId ? 'solo' : live ? `${members.length} online` : 'connecting…'}
          </span>

          {connected && !connected.lifx && <span className="pill warn">LIFX not connected</span>}

          {settings.voice_enabled && (
            <span
              className="pill"
              title={`Voice triggers: ${voiceStatus}${lastHeard ? ` — heard "${lastHeard}"` : ''}`}
            >
              <span className={voiceStatus === 'listening' ? 'dot live' : 'dot off'} /> 🎙
            </span>
          )}

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
          <GeneralTab
            send={send}
            members={members}
            displayName={displayName}
            groupId={groupId}
          />
        )}
        {tab === 'scenes' && (
          <ScenesTab
            scenes={scenes}
            reloadScenes={reloadScenes}
            userId={userId}
            groupId={groupId}
            displayName={displayName}
            send={send}
          />
        )}
        {tab === 'effects' && (
          <EffectsTab
            effects={effects}
            reloadEffects={reloadEffects}
            userId={userId}
            groupId={groupId}
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

      {showGroups && (
        <GroupManager
          groups={groups}
          activeGroupId={groupId}
          onChanged={async () => {
            await reloadGroups();
          }}
          onSwitch={switchGroup}
          onClose={() => setShowGroups(false)}
        />
      )}

      {showSettings && (
        <Connections
          userId={userId}
          settings={settings}
          voiceStatus={voiceStatus}
          lastHeard={lastHeard}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
