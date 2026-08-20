import { useEffect, useRef } from 'react';
import type { Frame } from '../lib/types';

/**
 * Waveform with keyframe markers.
 *
 * This is the piece that replaces timing effects by ear against a text editor:
 * you can see where the impact is in the audio and drop a light frame on it.
 */
export function Waveform({
  buffer,
  frames,
  durationMs,
  onScrub,
}: {
  buffer: AudioBuffer | null;
  frames: Frame[];
  durationMs: number;
  onScrub: (tMs: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Baseline
    ctx.strokeStyle = '#282c3f';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (buffer) {
      // Min/max peak per pixel column — cheap and reads well at this size.
      const data = buffer.getChannelData(0);
      const samplesPerPx = Math.max(1, Math.floor(data.length / width));

      ctx.fillStyle = '#4b4fa8';
      for (let x = 0; x < width; x++) {
        const start = x * samplesPerPx;
        let min = 1;
        let max = -1;
        for (let i = 0; i < samplesPerPx; i++) {
          const v = data[start + i];
          if (v === undefined) break;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const y1 = ((1 + min) / 2) * height;
        const y2 = ((1 + max) / 2) * height;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    }

    // Keyframe markers
    if (durationMs > 0) {
      for (const f of frames) {
        const x = (f.t_ms / durationMs) * width;
        ctx.strokeStyle = f.hex;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = f.hex;
        ctx.beginPath();
        ctx.arc(x, 7, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 1;
    }
  }, [buffer, frames, durationMs]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      onClick={(e) => {
        if (durationMs <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onScrub(Math.round(Math.max(0, Math.min(1, ratio)) * durationMs));
      }}
    />
  );
}
