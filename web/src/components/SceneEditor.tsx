import { useState } from 'react';
import { Modal } from './Modal';
import { normalisePlaylistUri } from '../lib/spotify';
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
      await onSave({ name: name.trim(), hex, brightness, playlist_uri: uri });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? 'Edit scene' : 'New scene'} onClose={onClose}>
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

      <div
        className="swatch-lg"
        style={{
          background: hex,
          opacity: 0.25 + brightness * 0.75,
          marginBottom: 14,
        }}
      />

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="shex">Colour</label>
          <input
            id="shex"
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
          />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="shexT">Hex</label>
          <input
            id="shexT"
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            placeholder="#CC7820"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="sbright">Brightness — {Math.round(brightness * 100)}%</label>
        <input
          id="sbright"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
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
