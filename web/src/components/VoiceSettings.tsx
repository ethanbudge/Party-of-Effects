import { useCallback, useEffect, useState } from 'react';
import {
  VOICE_LANGUAGES,
  availability,
  installLanguage,
  isVoiceSupported,
  supportsOnDevice,
  type Availability,
} from '../lib/voice';
import type { UserSettings } from '../lib/types';

/**
 * Voice trigger settings.
 *
 * The fiddly part is the language model: on-device recognition needs a
 * one-time download per language, managed by the browser. Rather than
 * discovering that at the moment someone tries to speak, this panel checks
 * availability whenever the language changes and offers the download up front,
 * with the toggle disabled until the model is actually ready.
 */
export function VoiceSettings({
  settings,
  status,
  lastHeard,
  onChange,
}: {
  settings: UserSettings;
  status: string;
  lastHeard: string | null;
  onChange: (patch: Partial<Omit<UserSettings, 'user_id'>>) => void;
}) {
  const [avail, setAvail] = useState<Availability | 'checking'>('checking');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = isVoiceSupported();
  const onDevice = supportsOnDevice();

  const check = useCallback(async (lang: string) => {
    setAvail('checking');
    setAvail(await availability(lang));
  }, []);

  useEffect(() => {
    if (!supported) return;
    void check(settings.voice_language);
  }, [settings.voice_language, supported, check]);

  // Chrome reports "downloading" while a pack is fetching but does not push an
  // event when it lands, so poll until it settles.
  useEffect(() => {
    if (avail !== 'downloading') return;
    const id = setInterval(() => void check(settings.voice_language), 2000);
    return () => clearInterval(id);
  }, [avail, settings.voice_language, check]);

  async function download() {
    setInstalling(true);
    setError(null);
    try {
      const ok = await installLanguage(settings.voice_language);
      if (!ok) setError('The browser refused the download. Try again, or pick another language.');
      await check(settings.voice_language);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  }

  if (!supported) {
    return (
      <div className="card">
        <h2>Voice triggers</h2>
        <p className="hint" style={{ margin: 0 }}>
          This browser has no speech recognition. Chrome, Edge, or Safari will work — Firefox
          never shipped the API.
        </p>
      </div>
    );
  }

  const ready = avail === 'available';
  // Without an on-device model, listening would mean streaming audio to a
  // speech service, so it stays blocked until explicitly allowed.
  const canEnable = ready || settings.voice_allow_cloud;

  const statusLabel: Record<string, string> = {
    idle: 'Off',
    starting: 'Connecting…',
    listening: 'Listening',
    suspended: 'Paused during an effect',
    denied: 'Microphone permission refused',
    error: 'Error',
    unsupported: 'Not supported',
  };

  return (
    <div className="card">
      <h2>Voice triggers</h2>
      <p className="hint">
        Say an effect's trigger word and it fires for the whole party, exactly as if you had
        clicked it. Recognition happens on this machine only — nobody else needs voice turned on,
        and it never touches their sound and light timing.
      </p>

      {/* --- language --- */}
      <div className="field">
        <label htmlFor="voicelang">Language</label>
        <select
          id="voicelang"
          value={settings.voice_language}
          onChange={(e) => {
            // Turn listening off while switching, so we never listen in a
            // language whose model isn't ready.
            onChange({ voice_language: e.target.value, voice_enabled: false });
          }}
        >
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* --- model state --- */}
      <div className="voice-model">
        {!onDevice ? (
          <p className="meta" style={{ margin: 0 }}>
            This browser can't run recognition on-device, so audio would be sent to a speech
            service. Update Chrome for local processing, or allow cloud recognition below.
          </p>
        ) : avail === 'checking' ? (
          <p className="meta" style={{ margin: 0 }}>
            Checking for an on-device model…
          </p>
        ) : avail === 'available' ? (
          <p className="meta" style={{ margin: 0 }}>
            <span className="dot" /> On-device model ready. Audio and transcripts stay on this
            machine, and it works offline.
          </p>
        ) : avail === 'downloading' ? (
          <p className="meta" style={{ margin: 0 }}>
            Downloading the language model… this happens once and is managed by your browser.
          </p>
        ) : avail === 'downloadable' ? (
          <div className="row wrap">
            <span className="meta" style={{ flex: 1 }}>
              A one-time language model download is needed for on-device recognition.
            </span>
            <button className="btn sm" onClick={download} disabled={installing}>
              {installing ? 'Downloading…' : 'Download model'}
            </button>
          </div>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            No on-device model for this language in your browser. Pick another language, or allow
            cloud recognition below.
          </p>
        )}
      </div>

      {/* --- cloud opt-in, only when it would actually be needed --- */}
      {!ready && avail !== 'checking' && avail !== 'downloading' && (
        <label className="check-row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.voice_allow_cloud}
            onChange={(e) =>
              onChange({ voice_allow_cloud: e.target.checked, voice_enabled: false })
            }
          />
          <span style={{ flex: 1 }}>
            Allow cloud recognition
            <br />
            <span className="meta">
              Sends microphone audio to your browser's speech service. Needs a connection.
            </span>
          </span>
        </label>
      )}

      {/* --- the switch --- */}
      <label className={`check-row${canEnable ? '' : ' off'}`} style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={settings.voice_enabled}
          disabled={!canEnable}
          onChange={(e) => onChange({ voice_enabled: e.target.checked })}
        />
        <span style={{ flex: 1 }}>
          Listen for trigger words
          <br />
          <span className="meta">
            {canEnable
              ? 'Your browser will ask for microphone permission the first time.'
              : 'Needs a ready language model, or cloud recognition allowed.'}
          </span>
        </span>
        <span className={`pill${status === 'listening' ? ' live' : ''}`}>
          {statusLabel[status] ?? status}
        </span>
      </label>

      {settings.voice_enabled && (
        <p className="meta" style={{ marginTop: 10 }}>
          Heard: <em>{lastHeard || '—'}</em>
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
        Trigger words are set per effect, in the effect editor. Pick phrases that won't come up in
        normal table talk — that is why dndlights used French cues for an English-speaking table.
      </p>
    </div>
  );
}
