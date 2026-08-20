import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { ColorWheel } from './ColorWheel';
import { FrameTimeline, newFrameId, type EditFrame } from './FrameTimeline';
import { TriggerWords } from './TriggerWords';
import {
  cancelActiveEffect,
  decodeFile,
  getCachedSound,
  loadSound,
  runEffect,
  unlockAudio,
} from '../lib/sequencer';
import { soundUrl } from '../lib/data';
import { framesToGradient, withBrightness } from '../lib/color';
import type { Effect, Frame } from '../lib/types';

export interface EffectDraft {
  name: string;
  frames: Frame[];
  revert_ms: number;
  duration_ms: number;
  trigger_words: string[];
  file: File | null;
}

const strip = (f: EditFrame): Frame => ({
  t_ms: f.t_ms,
  hex: f.hex,
  brightness: f.brightness,
  fade_ms: f.fade_ms,
});

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
  const [frames, setFrames] = useState<EditFrame[]>(
    () => (existing?.frames ?? []).map((f) => ({ ...f, id: newFrameId() })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revertMs, setRevertMs] = useState(existing?.revert_ms ?? 2000);
  const [triggers, setTriggers] = useState<string[]>(existing?.trigger_words ?? []);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(existing?.duration_ms ?? 0);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<{ cancel(): void } | null>(null);

  const sorted = useMemo(() => [...frames].sort((a, b) => a.t_ms - b.t_ms), [frames]);
  const selected = frames.find((f) => f.id === selectedId) ?? null;

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

  // Stop any preview if the dialog closes.
  useEffect(() => () => runRef.current?.cancel(), []);

  async function pickFile(f: File) {
    setError(null);
    try {
      const buf = await decodeFile(f);
      setBuffer(buf);
      setFile(f);
      setDurationMs(Math.round(buf.duration * 1000));
    } catch {
      setError('Could not decode that audio file. Try a .wav, .mp3, .ogg, or .m4a.');
    }
  }

  function patchSelected(patch: Partial<EditFrame>) {
    if (!selectedId) return;
    setFrames(frames.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)));
  }

  function addFrame() {
    const last = sorted[sorted.length - 1];
    const t = last ? Math.min(durationMs, last.t_ms + 200) : 0;
    const created: EditFrame = {
      id: newFrameId(),
      t_ms: t,
      hex: last?.hex ?? '#FFFFFF',
      brightness: last?.brightness ?? 0.9,
      fade_ms: 120,
    };
    setFrames([...frames, created]);
    setSelectedId(created.id);
  }

  function duplicateSelected() {
    if (!selected) return;
    const created: EditFrame = {
      ...selected,
      id: newFrameId(),
      t_ms: Math.min(durationMs, selected.t_ms + 150),
    };
    setFrames([...frames, created]);
    setSelectedId(created.id);
  }

  async function preview() {
    await unlockAudio();
    runRef.current?.cancel();
    runRef.current = runEffect(
      {
        id: existing?.id ?? 'preview',
        name,
        sound_path: null,
        duration_ms: durationMs,
        frames: sorted.map(strip),
        revert_ms: revertMs,
        trigger_words: [],
        group_id: null,
        created_by: null,
        created_at: '',
      },
      buffer ?? undefined,
      { onProgress: setPlayhead },
    );
  }

  function stopPreview() {
    runRef.current?.cancel();
    cancelActiveEffect();
    setPlayhead(null);
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
        frames: sorted.map(strip),
        revert_ms: revertMs,
        duration_ms: durationMs,
        trigger_words: triggers,
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
      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="ename">Name</label>
          <input
            id="ename"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fireball"
          />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="efile">
            Sound {existing && <span className="meta">(leave empty to keep current)</span>}
          </label>
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
      </div>

      {/* Preview strip: the effect as it appears on its tile. */}
      <div
        style={{
          height: 22,
          borderRadius: 6,
          marginBottom: 10,
          background: framesToGradient(sorted.map(strip), durationMs),
          border: '1px solid var(--border)',
        }}
      />

      <FrameTimeline
        buffer={buffer}
        frames={frames}
        durationMs={durationMs || 3000}
        selectedId={selectedId}
        playheadMs={playhead}
        onChange={setFrames}
        onSelect={setSelectedId}
      />

      <div className="tl-toolbar">
        <button className="btn secondary sm" onClick={addFrame}>
          + Frame
        </button>
        <button className="btn secondary sm" onClick={duplicateSelected} disabled={!selected}>
          Duplicate
        </button>
        <button
          className="btn secondary sm"
          disabled={!selected}
          onClick={() => {
            setFrames(frames.filter((f) => f.id !== selectedId));
            setSelectedId(null);
          }}
        >
          Delete
        </button>
        {playhead === null ? (
          <button className="btn sm" onClick={preview} disabled={frames.length === 0}>
            ▶ Preview on my lights
          </button>
        ) : (
          <button className="btn secondary sm" onClick={stopPreview}>
            ■ Stop
          </button>
        )}
        <span className="spacer" />
        <span className="meta">
          {durationMs > 0 ? `${(durationMs / 1000).toFixed(2)}s · ` : ''}
          {frames.length} frame{frames.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="hint" style={{ marginTop: -4 }}>
        Click the timeline to add a keyframe, drag a marker to move it, and use ← → to nudge
        (hold Shift for 100 ms). Backspace deletes the selected one.
      </p>

      <div className="grid-2">
        {/* --- selected frame --- */}
        <div className="frame-inspector">
          <h3>{selected ? `Frame at ${selected.t_ms} ms` : 'No frame selected'}</h3>

          {selected ? (
            <>
              <ColorWheel
                hex={selected.hex}
                brightness={selected.brightness}
                onChange={({ hex, brightness }) => patchSelected({ hex, brightness })}
              />

              <div className="row" style={{ marginTop: 16 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Time (ms)</label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={selected.t_ms}
                    onChange={(e) => patchSelected({ t_ms: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Fade into it (ms)</label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={selected.fade_ms}
                    onChange={(e) =>
                      patchSelected({ fade_ms: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              Click a marker on the timeline, or a row in the list, to edit its colour and
              brightness.
            </p>
          )}
        </div>

        {/* --- all frames --- */}
        <div className="frame-inspector">
          <h3>Frames</h3>

          {frames.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              None yet — click anywhere on the timeline above.
            </p>
          ) : (
            <>
              <div className="frame-head">
                <span>#</span>
                <span>Time</span>
                <span />
                <span>Bright</span>
                <span>Fade</span>
                <span />
              </div>
              <div className="frame-list">
                {sorted.map((f, i) => (
                  <div
                    key={f.id}
                    className={`frame-row${f.id === selectedId ? ' selected' : ''}`}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span className="frame-idx">{i + 1}</span>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={f.t_ms}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setFrames(
                          frames.map((x) =>
                            x.id === f.id ? { ...x, t_ms: Math.max(0, Number(e.target.value)) } : x,
                          ),
                        )
                      }
                    />
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        background: withBrightness(f.hex, f.brightness),
                        border: '1px solid var(--border-strong)',
                      }}
                      title={f.hex}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={f.brightness}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setFrames(
                          frames.map((x) =>
                            x.id === f.id ? { ...x, brightness: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      title={`${Math.round(f.brightness * 100)}%`}
                    />
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={f.fade_ms}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setFrames(
                          frames.map((x) =>
                            x.id === f.id
                              ? { ...x, fade_ms: Math.max(0, Number(e.target.value)) }
                              : x,
                          ),
                        )
                      }
                    />
                    <button
                      className="icon-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFrames(frames.filter((x) => x.id !== f.id));
                        if (selectedId === f.id) setSelectedId(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label>Fade back to the scene over {revertMs} ms</label>
            <input
              type="range"
              min={0}
              max={6000}
              step={100}
              value={revertMs}
              onChange={(e) => setRevertMs(Number(e.target.value))}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Voice triggers</label>
            <TriggerWords value={triggers} onChange={setTriggers} />
          </div>
        </div>
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
