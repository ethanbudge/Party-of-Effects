import { useCallback, useEffect, useRef, useState } from 'react';
import { withBrightness } from '../lib/color';
import type { Frame } from '../lib/types';

/** A frame with a stable identity, so dragging one past another doesn't swap
 *  which one you're holding. Stripped before saving. */
export interface EditFrame extends Frame {
  id: string;
}

export const newFrameId = () =>
  globalThis.crypto?.randomUUID?.() ?? `f${Math.random().toString(36).slice(2)}`;

const HEIGHT = 150;

/**
 * The effect timeline: waveform, colour bands, and draggable keyframes.
 *
 * Drag a marker to move it in time, click empty space to add one, click a
 * marker to select it for editing. This replaces having to type millisecond
 * values to line a flash up with an audio peak — you can see the peak and drop
 * the frame on it.
 */
export function FrameTimeline({
  buffer,
  frames,
  durationMs,
  selectedId,
  playheadMs,
  onChange,
  onSelect,
}: {
  buffer: AudioBuffer | null;
  frames: EditFrame[];
  durationMs: number;
  selectedId: string | null;
  playheadMs: number | null;
  onChange: (next: EditFrame[]) => void;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [width, setWidth] = useState(900);

  // Track container width so the canvas stays crisp when the modal resizes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const span = Math.max(durationMs, 1);
  const pxPerMs = width / span;

  // ---- paint ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.height = `${HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    // Always paint on a dark ground, in both themes. This strip is a preview of
    // lamps in a dim room — colours only read correctly against black, and the
    // cream waveform and ruler below would vanish on the light theme's paper.
    ctx.fillStyle = '#0C1618';
    ctx.fillRect(0, 0, width, HEIGHT);

    // Colour bands: each frame's colour holds until the next frame, so the
    // strip reads as the light sequence you'll actually see.
    const sorted = [...frames].sort((a, b) => a.t_ms - b.t_ms);
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i]!;
      const next = sorted[i + 1];
      const x0 = (f.t_ms / span) * width;
      const x1 = next ? (next.t_ms / span) * width : width;
      ctx.fillStyle = withBrightness(f.hex, f.brightness);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), HEIGHT);
    }
    ctx.globalAlpha = 1;

    // Waveform, centred, drawn over the bands.
    if (buffer) {
      const data = buffer.getChannelData(0);
      const per = Math.max(1, Math.floor(data.length / width));
      ctx.fillStyle = 'rgba(255, 236, 204, 0.62)';
      for (let x = 0; x < width; x++) {
        let min = 1;
        let max = -1;
        const start = x * per;
        for (let i = 0; i < per; i++) {
          const v = data[start + i];
          if (v === undefined) break;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min > max) continue;
        const y1 = ((1 + min) / 2) * HEIGHT;
        const y2 = ((1 + max) / 2) * HEIGHT;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    } else {
      ctx.strokeStyle = 'rgba(255, 236, 204, 0.25)';
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT / 2);
      ctx.lineTo(width, HEIGHT / 2);
      ctx.stroke();
    }

    // Time ruler every 500ms.
    ctx.fillStyle = 'rgba(255, 236, 204, 0.4)';
    ctx.font = '10px ui-monospace, monospace';
    for (let t = 0; t <= span; t += 500) {
      const x = (t / span) * width;
      ctx.fillRect(x, HEIGHT - 7, 1, 7);
      if (t % 1000 === 0 && t > 0) ctx.fillText(`${(t / 1000).toFixed(0)}s`, x + 3, HEIGHT - 10);
    }
  }, [buffer, frames, span, width]);

  // ---- interaction ---------------------------------------------------------

  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round((ratio * span) / 10) * 10; // snap to 10ms
    },
    [span],
  );

  useEffect(() => {
    if (!dragId) return;

    const move = (e: PointerEvent) => {
      const t = msFromClientX(e.clientX);
      onChange(frames.map((f) => (f.id === dragId ? { ...f, t_ms: t } : f)));
    };
    const up = () => setDragId(null);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragId, frames, msFromClientX, onChange]);

  // Delete / nudge the selected frame from the keyboard.
  useEffect(() => {
    if (!selectedId) return;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onChange(frames.filter((f) => f.id !== selectedId));
        onSelect(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        const delta = e.key === 'ArrowLeft' ? -step : step;
        onChange(
          frames.map((f) =>
            f.id === selectedId
              ? { ...f, t_ms: Math.max(0, Math.min(span, f.t_ms + delta)) }
              : f,
          ),
        );
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, frames, onChange, onSelect, span]);

  return (
    <div className="timeline" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%' }}
        onPointerDown={(e) => {
          // Empty space: drop a new frame here, inheriting the colour of
          // whatever frame is currently in effect at that moment.
          if (durationMs <= 0) return;
          const t = msFromClientX(e.clientX);
          const prior = [...frames].filter((f) => f.t_ms <= t).sort((a, b) => b.t_ms - a.t_ms)[0];
          const created: EditFrame = {
            id: newFrameId(),
            t_ms: t,
            hex: prior?.hex ?? '#FFFFFF',
            brightness: prior?.brightness ?? 0.9,
            fade_ms: 120,
          };
          onChange([...frames, created]);
          onSelect(created.id);
        }}
      />

      {frames.map((f) => {
        const x = f.t_ms * pxPerMs;
        const colour = withBrightness(f.hex, Math.max(f.brightness, 0.5));
        return (
          <div
            key={f.id}
            className={`tl-marker${selectedId === f.id ? ' selected' : ''}`}
            style={{ left: x }}
            title={`${f.t_ms} ms · ${f.hex} · ${Math.round(f.brightness * 100)}%`}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSelect(f.id);
              setDragId(f.id);
            }}
          >
            <div className="tl-marker-line" style={{ background: colour }} />
            <div className="tl-marker-grip" style={{ background: colour }} />
          </div>
        );
      })}

      {playheadMs !== null && (
        <div className="tl-playhead" style={{ left: playheadMs * pxPerMs }} />
      )}
    </div>
  );
}
