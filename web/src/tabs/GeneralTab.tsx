import { useState } from 'react';
import { ColorWheel } from '../components/ColorWheel';
import { applyLight, getLightProfile, setAmbient } from '../lib/sequencer';
import { normalisePlaylistUri, pause, playContext } from '../lib/spotify';
import { sceneGradient } from '../lib/color';
import type { GroupId, PartyEvent } from '../lib/types';
import type { PartyMember } from '../lib/realtime';

/**
 * Live control for the whole table.
 *
 * "Everyone" means: broadcast the intent, and every connected browser applies
 * it to its own lights with its own credentials and its own brightness cap.
 * Nothing reaches anyone who isn't currently in the session.
 */
export function GeneralTab({
  send,
  members,
  displayName,
  groupId,
}: {
  send: (event: PartyEvent) => void;
  members: PartyMember[];
  displayName: string;
  groupId: GroupId;
}) {
  const [hex, setHex] = useState('#CC7820');
  const [brightness, setBrightness] = useState(0.5);
  const [durationMs, setDurationMs] = useState(800);
  const [playlist, setPlaylist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cap = getLightProfile().maxBrightness;

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
      send({ type: 'music', action: 'play', contextUri: uri, by: displayName });
      setNotice(
        groupId
          ? `Sent to ${members.length} connected ${members.length === 1 ? 'player' : 'players'}.`
          : 'Playing on your own account — you are not in a group.',
      );
    } else {
      playContext(uri).catch((e) => setError((e as Error).message));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>General</h1>
        <span className="meta">Live control for the whole table</span>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Lights</h2>
          <p className="hint">
            Sets the ambient state everyone's effects fade back to.
          </p>

          <div
            className="swatch-lg"
            style={{ background: sceneGradient(hex, brightness), marginBottom: 18, height: 84 }}
          />

          <ColorWheel
            hex={hex}
            brightness={brightness}
            onChange={({ hex: h, brightness: b }) => {
              setHex(h);
              setBrightness(b);
            }}
          />

          <div className="field" style={{ marginTop: 18 }}>
            <label>Fade — {durationMs} ms</label>
            <input
              type="range"
              min={0}
              max={5000}
              step={100}
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
            />
          </div>

          <div className="row wrap">
            <button className="btn" onClick={() => pushLight('party')}>
              {groupId ? 'Apply to everyone' : 'Apply'}
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

          {cap < 1 && (
            <p className="meta" style={{ marginTop: 12 }}>
              Your own cap is {Math.round(cap * 100)}%, so this lands at{' '}
              {Math.round(brightness * cap * 100)}% on your bulbs. Everyone else's cap applies to
              theirs.
            </p>
          )}
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

          <div className="row wrap">
            <button className="btn" onClick={() => pushMusic('party')}>
              Play for everyone
            </button>
            <button className="btn secondary" onClick={() => pushMusic('me')}>
              Just me
            </button>
            <button
              className="btn secondary sm"
              onClick={() => send({ type: 'music', action: 'pause', by: displayName })}
            >
              Pause everyone
            </button>
            <button className="btn secondary sm" onClick={() => void pause()}>
              Pause me
            </button>
          </div>

          {error && <p className="error">{error}</p>}
          {notice && <p className="success">{notice}</p>}

          <h3 style={{ marginTop: 24 }}>In the session</h3>
          <p className="hint">
            {groupId
              ? "Only these people's lights will respond. Nobody offline can be reached — by anyone, including you."
              : "You're working solo, so everything here affects only your own lights and Spotify. Join a group to play together."}
          </p>
          <div className="row wrap">
            {!groupId ? (
              <span className="pill">
                <span className="dot off" /> Solo
              </span>
            ) : members.length === 0 ? (
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
    </div>
  );
}
