import { useState } from 'react';
import { applyLight, setAmbient } from '../lib/sequencer';
import { normalisePlaylistUri, pause, playContext } from '../lib/spotify';
import type { PartyEvent } from '../lib/types';
import type { PartyMember } from '../lib/realtime';

/**
 * Live control for the whole table.
 *
 * "Everyone" here means: broadcast the intent, and every connected browser
 * applies it to its own lights with its own credentials. Nothing is applied to
 * anyone who isn't currently in the session.
 */
export function GeneralTab({
  send,
  members,
  displayName,
}: {
  send: (event: PartyEvent) => void;
  members: PartyMember[];
  displayName: string;
}) {
  const [hex, setHex] = useState('#CC7820');
  const [brightness, setBrightness] = useState(0.5);
  const [durationMs, setDurationMs] = useState(800);
  const [playlist, setPlaylist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function pushLight(scope: 'party' | 'me', power?: 'on' | 'off') {
    setAmbient({ hex, brightness, durationMs });

    if (scope === 'party') {
      send({ type: 'light', hex, brightness, durationMs, power, by: displayName });
    } else {
      void applyLight({ hex, brightness, durationMs }, power);
    }
  }

  function pushMusic(scope: 'party' | 'me') {
    const uri = normalisePlaylistUri(playlist);
    if (!uri) {
      setNotice(null);
      return setError('That does not look like a Spotify playlist link, URI, or id.');
    }

    setError(null);
    if (scope === 'party') {
      send({ type: 'music', contextUri: uri, by: displayName });
      setNotice(`Sent to ${members.length} connected ${members.length === 1 ? 'player' : 'players'}.`);
    } else {
      playContext(uri).catch((e) => setError((e as Error).message));
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Lights</h2>
        <p className="hint">
          Sets the ambient state everyone's effects fade back to.
        </p>

        <div
          className="swatch-lg"
          style={{ background: hex, opacity: 0.25 + brightness * 0.75, marginBottom: 16 }}
        />

        <div className="row" style={{ marginBottom: 14 }}>
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            aria-label="Colour"
          />
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            style={{ maxWidth: 120 }}
            aria-label="Hex"
          />
        </div>

        <div className="field">
          <label htmlFor="gbright">Brightness — {Math.round(brightness * 100)}%</label>
          <input
            id="gbright"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="gdur">Fade — {durationMs} ms</label>
          <input
            id="gdur"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={durationMs}
            onChange={(e) => setDurationMs(Number(e.target.value))}
          />
        </div>

        <div className="row">
          <button className="btn" onClick={() => pushLight('party')}>
            Apply to everyone
          </button>
          <button className="btn secondary" onClick={() => pushLight('me')}>
            Just me
          </button>
          <button className="btn secondary sm" onClick={() => pushLight('party', 'on')}>
            All on
          </button>
          <button className="btn secondary sm" onClick={() => pushLight('party', 'off')}>
            All off
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Music</h2>
        <p className="hint">
          Starts the same playlist on each person's own Spotify account, in their own browser tab.
        </p>

        <div className="field">
          <label htmlFor="gplay">Playlist link</label>
          <input
            id="gplay"
            type="text"
            value={playlist}
            onChange={(e) => setPlaylist(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
          />
        </div>

        <div className="row">
          <button className="btn" onClick={() => pushMusic('party')}>
            Play for everyone
          </button>
          <button className="btn secondary" onClick={() => pushMusic('me')}>
            Just me
          </button>
          <button
            className="btn secondary"
            onClick={() => send({ type: 'music', contextUri: null, by: displayName })}
          >
            Pause everyone
          </button>
          <button className="btn secondary sm" onClick={() => void pause()}>
            Pause me
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
      </div>

      <div className="card">
        <h2>In the session</h2>
        <p className="hint">
          Only these people's lights will respond. Nobody offline can be reached — by anyone,
          including you.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {members.length === 0 ? (
            <span className="meta">Connecting…</span>
          ) : (
            members.map((m) => (
              <span key={m.userId} className="pill">
                <span className="dot" /> {m.displayName}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
