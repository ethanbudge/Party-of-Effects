import { useState } from 'react';
import { Modal } from './Modal';
import { ColorWheel } from './ColorWheel';
import { normalisePlaylistUri } from '../lib/spotify';
import { sceneGradient } from '../lib/color';
import type { Scene } from '../lib/types';

export interface SceneDraft {
  name: string;
  hex: string;
  brightness: number;
  playlist_uri: string | null;
}

export function SceneEditor({
  existing,
  onSave,
  onClose,
}: {
  existing?: Scene;
  onSave: (draft: SceneDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [hex, setHex] = useState(existing?.hex ?? '#CC7820');
  const [brightness, setBrightness] = useState(existing?.brightness ?? 0.4);
  const [playlist, setPlaylist] = useState(existing?.playlist_uri ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError('Give the scene a name.');
    if (!/^#[0-9A-F]{6}$/i.test(hex)) return setError('Pick a valid colour.');

    let uri: string | null = null;
    if (playlist.trim()) {
      uri = normalisePlaylistUri(playlist);
      if (!uri) {
        return setError('That does not look like a Spotify playlist link, URI, or id.');
      }
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), hex: hex.toUpperCase(), brightness, playlist_uri: uri });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? 'Edit scene' : 'New scene'} onClose={onClose}>
      {/* Shows exactly how the tile will look. */}
      <div
        style={{
          height: 92,
          borderRadius: 'var(--radius)',
          marginBottom: 18,
          background: sceneGradient(hex, brightness),
          border: '1px solid var(--border-strong)',
        }}
      />

      <div className="field">
        <label htmlFor="sname">Name</label>
        <input
          id="sname"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tavern"
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <ColorWheel
          hex={hex}
          brightness={brightness}
          onChange={({ hex: h, brightness: b }) => {
            setHex(h);
            setBrightness(b);
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="splay">Spotify playlist (optional)</label>
        <input
          id="splay"
          type="text"
          value={playlist}
          onChange={(e) => setPlaylist(e.target.value)}
          placeholder="https://open.spotify.com/playlist/…"
        />
      </div>
      <p className="hint">
        Paste a share link, a <code>spotify:playlist:…</code> URI, or the bare id. Cueing this scene
        starts it on everyone's own Spotify account.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="modal-foot">
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save scene'}
        </button>
      </div>
    </Modal>
  );
}
