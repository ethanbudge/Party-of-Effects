import { useEffect, useState } from 'react';
import { currentPlayer } from '../lib/spotify';
import { framesToGradient, sceneGradient } from '../lib/color';
import type { Effect, PartyEvent, Scene } from '../lib/types';

interface TrackState {
  title: string;
  artist: string;
  album: string;
  /** Smallest available cover art, for the dock thumbnail. */
  artUrl: string | null;
  paused: boolean;
  positionMs: number;
  durationMs: number;
}

/**
 * The two docks in the bottom-left corner: what's playing, and what just fired.
 *
 * Track info comes from the Web Playback SDK's own state events rather than
 * polling the Web API — it updates instantly and costs no requests.
 */
export function NowPlaying({
  scene,
  effect,
  send,
  displayName,
}: {
  scene: Scene | null;
  effect: Effect | null;
  send: (event: PartyEvent) => void;
  displayName: string;
}) {
  const [track, setTrack] = useState<TrackState | null>(null);

  useEffect(() => {
    const handle = currentPlayer();
    if (!handle) return;

    const onState = (state: Spotify.PlaybackState | null) => {
      if (!state) return setTrack(null);
      const t = state.track_window.current_track;
      // Smallest image is plenty for a 58px thumbnail; Spotify returns them
      // largest-first, so take the last.
      const images = t.album?.images ?? [];
      setTrack({
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album?.name ?? '',
        artUrl: images.length ? (images[images.length - 1]?.url ?? null) : null,
        paused: state.paused,
        positionMs: state.position,
        durationMs: state.duration,
      });
    };

    handle.player.addListener('player_state_changed', onState);
    void handle.player.getCurrentState().then(onState);

    return () => handle.player.removeListener('player_state_changed', onState);
    // Re-attach whenever a scene cue may have brought the player up.
  }, [scene]);

  // Advance the progress bar between state events, which only fire on change.
  useEffect(() => {
    if (!track || track.paused) return;
    const id = setInterval(() => {
      setTrack((t) =>
        t && !t.paused
          ? { ...t, positionMs: Math.min(t.durationMs, t.positionMs + 1000) }
          : t,
      );
    }, 1000);
    return () => clearInterval(id);
  }, [track?.paused, track?.title]);

  const nothingToShow = !scene && !track && !effect;
  if (nothingToShow) return null;

  const progress = track && track.durationMs > 0 ? track.positionMs / track.durationMs : 0;

  return (
    <div className="dock">
      {effect && (
        <div className="dock-card">
          <div className="dock-swatch">
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: framesToGradient(effect.frames, effect.duration_ms),
              }}
            />
          </div>
          <div className="dock-main">
            <div className="dock-title">{effect.name}</div>
            <div className="dock-sub">
              {(effect.duration_ms / 1000).toFixed(1)}s · {effect.frames.length} frames
              {!effect.sound_path && ' · no sound'}
            </div>
          </div>
        </div>
      )}

      {(scene || track) && (
        <div className="dock-card">
          {/* Scene colour stays as the left edge — it's what identifies the
              card — with the album cover beside it when something is playing. */}
          <div className="dock-swatch narrow">
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: scene
                  ? sceneGradient(scene.hex, scene.brightness)
                  : 'var(--surface-2)',
              }}
            />
            {track && <div className="dock-progress" style={{ width: `${progress * 100}%` }} />}
          </div>

          {track?.artUrl && (
            <img className="dock-art" src={track.artUrl} alt="" width={58} height={58} />
          )}

          <div className="dock-main">
            <div className="dock-title">{track ? track.title : (scene?.name ?? 'No scene')}</div>

            {track ? (
              <>
                <div className="dock-sub">{track.artist}</div>
                <div className="dock-sub faint">
                  {track.album}
                  {scene && ` · ${scene.name}`}
                </div>
              </>
            ) : (
              scene && (
                <div className="dock-sub">
                  {Math.round(scene.brightness * 100)}% ·{' '}
                  {scene.playlist_uri ? 'playlist linked' : 'no playlist'}
                </div>
              )
            )}
          </div>

          <div className="dock-controls">
            <button
              className="dock-btn"
              title="Previous, for everyone"
              onClick={() => send({ type: 'music', action: 'previous', by: displayName })}
            >
              ⏮
            </button>
            <button
              className="dock-btn"
              title={track?.paused ? 'Resume for everyone' : 'Pause for everyone'}
              onClick={() =>
                send({
                  type: 'music',
                  action: track?.paused ? 'resume' : 'pause',
                  by: displayName,
                })
              }
            >
              {track?.paused ? '▶' : '⏸'}
            </button>
            <button
              className="dock-btn"
              title="Skip, for everyone"
              onClick={() => send({ type: 'music', action: 'next', by: displayName })}
            >
              ⏭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
