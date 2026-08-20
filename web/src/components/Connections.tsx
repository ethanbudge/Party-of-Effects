import { useEffect, useState } from 'react';
import { api, ApiError, type LifxLight } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';
import {
  applyLight,
  calibrationOffsetMs,
  measuredLatencyMs,
  setCalibrationOffsetMs,
} from '../lib/sequencer';
import * as db from '../lib/data';
import type { UserSettings } from '../lib/types';

/**
 * Connections and personal settings.
 *
 * The LIFX token goes straight to the API, which validates it against LIFX,
 * encrypts it, and stores the ciphertext. It is never held in component state
 * after submit and there is no endpoint that reads it back — the status check
 * returns booleans, not values.
 */
export function Connections({
  userId,
  settings,
  onSettingsChange,
  onClose,
}: {
  userId: string;
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<{ lifx: boolean; spotify: boolean } | null>(null);
  const [lifxToken, setLifxToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lights, setLights] = useState<LifxLight[]>([]);
  const [offset, setOffset] = useState(calibrationOffsetMs());

  async function refresh() {
    try {
      const s = await api.status();
      setStatus(s);
      if (s.lifx) setLights((await api.lifxLights()).lights);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  /** Persist a settings change and push it live immediately. */
  async function patchSettings(patch: Partial<Omit<UserSettings, 'user_id'>>) {
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    try {
      await db.saveSettings(userId, patch);
    } catch (err) {
      setError(`Could not save settings: ${(err as Error).message}`);
    }
  }

  const selectedIds = settings.light_ids;
  const isOn = (id: string) => !selectedIds || selectedIds.length === 0 || selectedIds.includes(id);

  function toggleLight(id: string) {
    // Null means "all". Materialise that into a concrete list on first toggle,
    // otherwise unchecking one bulb would read as unchecking nothing.
    const base = !selectedIds || selectedIds.length === 0 ? lights.map((l) => l.id) : selectedIds;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    void patchSettings({ light_ids: next });
  }

  async function saveLifx() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.connectLifx(lifxToken.trim());
      setLifxToken('');
      setNotice(
        res.lights.length
          ? `Connected. Found ${res.lights.length} light${res.lights.length === 1 ? '' : 's'}.`
          : 'Connected, but LIFX reports no lights on this account.',
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connectSpotify() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.spotifyAuthorizeUrl();
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const maxPct = Math.round(settings.max_brightness * 100);

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="grid-2">
        {/* ---- LIFX ---- */}
        <div className="card">
          <h2>LIFX</h2>
          <p className="hint">
            {status?.lifx
              ? 'Connected. Your token is encrypted at rest and only ever used by your own logged-in session.'
              : 'Paste a personal access token from cloud.lifx.com/settings.'}
          </p>

          {status?.lifx ? (
            <button
              className="btn danger sm"
              onClick={async () => {
                await api.disconnectLifx();
                setLights([]);
                await refresh();
              }}
            >
              Disconnect LIFX
            </button>
          ) : (
            <>
              <div className="field">
                <label htmlFor="lifx">Personal access token</label>
                <input
                  id="lifx"
                  type="password"
                  value={lifxToken}
                  onChange={(e) => setLifxToken(e.target.value)}
                  placeholder="c1c2…"
                  autoComplete="off"
                />
              </div>
              <button className="btn" onClick={saveLifx} disabled={busy || lifxToken.length < 20}>
                {busy ? 'Validating…' : 'Connect LIFX'}
              </button>
            </>
          )}
        </div>

        {/* ---- Spotify ---- */}
        <div className="card">
          <h2>Spotify</h2>
          <p className="hint">
            {status?.spotify
              ? 'Connected. Playback happens in this browser tab, on your own account.'
              : 'Authorise Spotify so scenes can start playlists on your account. Premium is required for playback control.'}
          </p>

          {status?.spotify ? (
            <button
              className="btn danger sm"
              onClick={async () => {
                await api.disconnectSpotify();
                await refresh();
              }}
            >
              Disconnect Spotify
            </button>
          ) : (
            <button className="btn" onClick={connectSpotify} disabled={busy}>
              Connect Spotify
            </button>
          )}
        </div>
      </div>

      {/* ---- Which lights ---- */}
      <div className="card">
        <h2>Which lights take part</h2>
        <p className="hint">
          Only the bulbs you tick here will respond to scenes and effects. Untick the ones in other
          rooms and the app leaves them alone entirely — it never sends them a command, so they
          stay on whatever you had them set to.
        </p>

        {lights.length === 0 ? (
          <p className="meta">
            {status?.lifx ? 'No lights reported by LIFX.' : 'Connect LIFX to choose lights.'}
          </p>
        ) : (
          <>
            {lights.map((l) => (
              <label key={l.id} className={`check-row${isOn(l.id) ? '' : ' off'}`}>
                <input type="checkbox" checked={isOn(l.id)} onChange={() => toggleLight(l.id)} />
                <span style={{ flex: 1 }}>{l.label}</span>
                <span className="meta">
                  {l.connected ? l.power : 'offline'}
                </span>
              </label>
            ))}

            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn secondary sm"
                onClick={() => void patchSettings({ light_ids: null })}
              >
                Select all
              </button>
              <span className="meta">
                {!selectedIds || selectedIds.length === 0
                  ? `All ${lights.length} lights`
                  : `${selectedIds.length} of ${lights.length} selected`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ---- Brightness cap ---- */}
      <div className="card">
        <h2>Maximum brightness</h2>
        <p className="hint">
          Scales everything sent to your lights. At {maxPct}%, an effect that asks for 50% lands at{' '}
          <strong>{Math.round(0.5 * settings.max_brightness * 100)}%</strong> on your bulbs. Your
          cap applies to effects other people trigger too, so you can sit at a comfortable level
          without anyone else having to change what they authored.
        </p>

        <div className="field">
          <label>Cap — {maxPct}%</label>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={settings.max_brightness}
            onChange={(e) => void patchSettings({ max_brightness: Number(e.target.value) })}
          />
        </div>

        <button
          className="btn secondary sm"
          onClick={() => void applyLight({ hex: '#FFECCC', brightness: 1, durationMs: 400 })}
        >
          Test at full brightness
        </button>
      </div>

      {/* ---- Timing ---- */}
      <div className="card">
        <h2>Light timing</h2>
        <p className="hint">
          Light commands are sent early so the flash lands with the sound. Measured round trip is
          currently <strong>{measuredLatencyMs()} ms</strong>. If your lights feel late, raise this;
          if they fire before the sound, lower it.
        </p>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Extra lead time — {offset} ms</label>
          <input
            type="range"
            min={-300}
            max={600}
            step={10}
            value={offset}
            onChange={(e) => {
              const v = Number(e.target.value);
              setOffset(v);
              setCalibrationOffsetMs(v);
            }}
          />
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="modal-foot">
        <button className="btn secondary" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
