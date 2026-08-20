import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Waveform } from './Waveform';
import { decodeFile, getCachedSound, loadSound, runEffect, unlockAudio } from '../lib/sequencer';
import { soundUrl } from '../lib/data';
import type { Effect, Frame } from '../lib/types';

export interface EffectDraft {
  name: string;
  frames: Frame[];
  revert_ms: number;
  duration_ms: number;
  /** Present only when a new sound was chosen. */
  file: File | null;
}

const DEFAULT_FRAME: Omit<Frame, 't_ms'> = {
  hex: '#FFFFFF',
  brightness: 0.9,
  fade_ms: 120,
};

export function EffectEditor({
  existing,
  onSave,
  onClose,
}: {
  existing?: Effect;
  onSave: (draft: EffectDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [frames, setFrames] = useState<Frame[]>(existing?.frames ?? []);
  const [revertMs, setRevertMs] = useState(existing?.revert_ms ?? 2000);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(existing?.duration_ms ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull the existing sound in so the waveform is there when editing.
  useEffect(() => {
    if (!existing?.sound_path) return;

    const cached = getCachedSound(existing.id);
    if (cached) {
      setBuffer(cached);
      return;
    }

    void (async () => {
      try {
        const url = await soundUrl(existing.sound_path!);
        setBuffer(await loadSound(existing.id, url));
      } catch (err) {
        setError(`Could not load the existing sound: ${(err as Error).message}`);
      }
    })();
  }, [existing]);

  async function pickFile(f: File) {
    setError(null);
    try {
      const buf = await decodeFile(f);
      setBuffer(buf);
      setFile(f);
      // Length is measured from the decoded audio, not guessed or typed in.
      setDurationMs(Math.round(buf.duration * 1000));
    } catch {
      setError('Could not decode that audio file. Try a .wav, .mp3, .ogg, or .m4a.');
    }
  }

  function addFrame(tMs: number) {
    const next = [...frames, { t_ms: tMs, ...DEFAULT_FRAME }].sort((a, b) => a.t_ms - b.t_ms);
    setFrames(next);
  }

  function patchFrame(index: number, patch: Partial<Frame>) {
    setFrames(frames.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFrame(index: number) {
    setFrames(frames.filter((_, i) => i !== index));
  }

  async function preview() {
    await unlockAudio();
    runEffect(
      {
        id: existing?.id ?? 'preview',
        name,
        sound_path: null,
        duration_ms: durationMs,
        frames,
        revert_ms: revertMs,
        created_by: null,
        created_at: '',
      },
      buffer ?? undefined,
    );
  }

  async function save() {
    if (!name.trim()) return setError('Give the effect a name.');
    if (!existing && !file) return setError('Choose a sound file.');
    if (frames.length === 0) return setError('Add at least one light frame.');

    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        frames: [...frames].sort((a, b) => a.t_ms - b.t_ms),
        revert_ms: revertMs,
        duration_ms: durationMs,
        file,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? 'Edit effect' : 'New effect'} onClose={onClose} wide>
      <div className="field">
        <label htmlFor="ename">Name</label>
        <input
          id="ename"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fireball"
        />
      </div>

      <div className="field">
        <label htmlFor="efile">Sound {existing && '(leave empty to keep the current one)'}</label>
        <input
          id="efile"
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
          }}
        />
      </div>

      {durationMs > 0 && (
        <p className="meta" style={{ marginBottom: 8 }}>
          Length: <strong>{(durationMs / 1000).toFixed(2)}s</strong> — click the waveform to drop a
          light frame.
        </p>
      )}

      <Waveform buffer={buffer} frames={frames} durationMs={durationMs} onScrub={addFrame} />

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn secondary sm"
          onClick={() => addFrame(frames.length ? Math.min(durationMs, frames.at(-1)!.t_ms + 200) : 0)}
          disabled={durationMs === 0}
        >
          + Frame
        </button>
        <button className="btn secondary sm" onClick={preview} disabled={frames.length === 0}>
          ▶ Preview on my lights
        </button>
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {frames.length} frame{frames.length === 1 ? '' : 's'}
        </span>
      </div>

      {frames.length > 0 && (
        <div className="frame-list">
          <div className="frame-row" style={{ background: 'transparent', border: 'none' }}>
            <span className="frame-idx">#</span>
            <span className="meta">Time ms</span>
            <span className="meta">Colour</span>
            <span className="meta">Fade ms</span>
            <span />
          </div>

          {frames.map((f, i) => (
            <div className="frame-row" key={i}>
              <span className="frame-idx">{i + 1}</span>
              <input
                type="number"
                min={0}
                max={durationMs}
                step={10}
                value={f.t_ms}
                onChange={(e) => patchFrame(i, { t_ms: Number(e.target.value) })}
              />
              <div className="row">
                <input
                  type="color"
                  value={f.hex}
                  onChange={(e) => patchFrame(i, { hex: e.target.value.toUpperCase() })}
                  style={{ width: 36, height: 28 }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={f.brightness}
                  onChange={(e) => patchFrame(i, { brightness: Number(e.target.value) })}
                  title={`Brightness ${Math.round(f.brightness * 100)}%`}
                />
              </div>
              <input
                type="number"
                min={0}
                step={10}
                value={f.fade_ms}
                onChange={(e) => patchFrame(i, { fade_ms: Number(e.target.value) })}
              />
              <button className="chip-x" onClick={() => removeFrame(i)} title="Remove frame">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="erevert">Fade back to the scene over {revertMs} ms</label>
        <input
          id="erevert"
          type="range"
          min={0}
          max={6000}
          step={100}
          value={revertMs}
          onChange={(e) => setRevertMs(Number(e.target.value))}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="modal-foot">
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save effect'}
        </button>
      </div>
    </Modal>
  );
}
