import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';
import { calibrationOffsetMs, measuredLatencyMs, setCalibrationOffsetMs } from '../lib/sequencer';

/**
 * Connect LIFX and Spotify.
 *
 * The LIFX token goes straight to the API, which validates it against LIFX,
 * encrypts it, and stores the ciphertext. It is never written to component
 * state after submit, never put in localStorage, and there is no endpoint that
 * can read it back out — the status check below returns a boolean, not a value.
 */
export function Connections({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{ lifx: boolean; spotify: boolean } | null>(null);
  const [lifxToken, setLifxToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lights, setLights] = useState<{ id: string; label: string }[]>([]);
  const [offset, setOffset] = useState(calibrationOffsetMs());

  async function refresh() {
    try {
      const s = await api.status();
      setStatus(s);
      if (s.lifx) {
        const { lights } = await api.lifxLights();
        setLights(lights);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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

  return (
    <Modal title="Connections" onClose={onClose}>
      {/* ---- LIFX ---- */}
      <div className="card">
        <h2>LIFX</h2>
        <p className="hint">
          {status?.lifx
            ? 'Connected. Your token is encrypted at rest and only ever used by your own logged-in session.'
            : 'Paste a personal access token from cloud.lifx.com/settings.'}
        </p>

        {status?.lifx ? (
          <>
            {lights.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                {lights.map((l) => (
                  <span key={l.id} className="pill">
                    <span className="dot" /> {l.label}
                  </span>
                ))}
              </div>
            )}
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
          </>
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

      {/* ---- Timing ---- */}
      <div className="card">
        <h2>Light timing</h2>
        <p className="hint">
          Light commands are sent early so the flash lands with the sound. Measured round trip is
          currently <strong>{measuredLatencyMs()} ms</strong>. If your lights feel late, raise this;
          if they fire before the sound, lower it.
        </p>
        <div className="field">
          <label htmlFor="offset">Extra lead time: {offset} ms</label>
          <input
            id="offset"
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
