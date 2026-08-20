import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KELVIN_MAX,
  KELVIN_MIN,
  clamp01,
  hexToHsv,
  hsvToHex,
  kelvinToHex,
} from '../lib/color';

/**
 * LIFX-style colour picker: a hue/saturation wheel plus a white-temperature
 * strip, rather than a browser's rectangular gradient box.
 *
 * The wheel maps angle to hue and radius to saturation, which is how the LIFX
 * app presents colour — so a colour you pick here lands where you expect on the
 * bulb. Brightness is deliberately a separate control: on a bulb, "how
 * saturated" and "how bright" are independent, and collapsing them into one
 * square is what makes the default picker misleading for lighting.
 */

const SIZE = 216;

function drawWheel(canvas: HTMLCanvasElement, value: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);

  const r = SIZE / 2;
  const img = ctx.createImageData(SIZE * dpr, SIZE * dpr);
  const data = img.data;

  for (let py = 0; py < SIZE * dpr; py++) {
    for (let px = 0; px < SIZE * dpr; px++) {
      const x = px / dpr - r;
      const y = py / dpr - r;
      const dist = Math.sqrt(x * x + y * y);
      const i = (py * SIZE * dpr + px) * 4;

      if (dist > r) {
        data[i + 3] = 0;
        continue;
      }

      const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const sat = Math.min(1, dist / r);

      // Inline HSV->RGB; calling out per-pixel is measurably slower.
      const c = value * sat;
      const xx = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      const m = value - c;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      if (hue < 60) [rr, gg, bb] = [c, xx, 0];
      else if (hue < 120) [rr, gg, bb] = [xx, c, 0];
      else if (hue < 180) [rr, gg, bb] = [0, c, xx];
      else if (hue < 240) [rr, gg, bb] = [0, xx, c];
      else if (hue < 300) [rr, gg, bb] = [xx, 0, c];
      else [rr, gg, bb] = [c, 0, xx];

      data[i] = (rr + m) * 255;
      data[i + 1] = (gg + m) * 255;
      data[i + 2] = (bb + m) * 255;
      // Feather the last pixel ring so the edge isn't jagged.
      data[i + 3] = dist > r - 1 ? (r - dist) * 255 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawKelvin(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 240;
  const h = 26;
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 10; i++) {
    grad.addColorStop(i / 10, kelvinToHex(KELVIN_MIN + (KELVIN_MAX - KELVIN_MIN) * (i / 10)));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** A few colours worth one click, drawn from the app's own palette + bulb whites. */
const PRESETS = [
  '#CD533B', '#FF7A00', '#FFB040', '#FFE060', '#94A187', '#4CC38A',
  '#004643', '#2AA9C4', '#3B6FE0', '#7B4FE0', '#C04AD0', '#FF4D8D',
  kelvinToHex(2000), kelvinToHex(2700), kelvinToHex(4000), kelvinToHex(6500),
];

export function ColorWheel({
  hex,
  brightness,
  onChange,
  showBrightness = true,
}: {
  hex: string;
  brightness: number;
  onChange: (next: { hex: string; brightness: number }) => void;
  showBrightness?: boolean;
}) {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const kelvinRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<null | 'wheel' | 'kelvin'>(null);

  const hsv = hexToHsv(hex);

  // The wheel is painted at full value; brightness is shown separately, so the
  // wheel doesn't go black when you dim the bulb.
  useEffect(() => {
    if (wheelRef.current) drawWheel(wheelRef.current, 1);
  }, []);

  useEffect(() => {
    if (kelvinRef.current) drawKelvin(kelvinRef.current);
  }, []);

  const pickFromWheel = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const r = rect.width / 2;
      const x = clientX - rect.left - r;
      const y = clientY - rect.top - r;

      const dist = Math.sqrt(x * x + y * y);
      const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const sat = Math.min(1, dist / r);

      onChange({ hex: hsvToHex(hue, sat, 1), brightness });
    },
    [onChange, brightness],
  );

  const pickFromKelvin = useCallback(
    (clientX: number) => {
      const el = kelvinRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = clamp01((clientX - rect.left) / rect.width);
      onChange({ hex: kelvinToHex(KELVIN_MIN + (KELVIN_MAX - KELVIN_MIN) * ratio), brightness });
    },
    [onChange, brightness],
  );

  // Track the pointer past the element edges so a drag doesn't stick.
  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      if (dragging === 'wheel') pickFromWheel(e.clientX, e.clientY);
      else pickFromKelvin(e.clientX);
    };
    const up = () => setDragging(null);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, pickFromWheel, pickFromKelvin]);

  // Knob position from the current hue/saturation.
  const rad = (hsv.h * Math.PI) / 180;
  const knobX = 50 + Math.cos(rad) * hsv.s * 50;
  const knobY = 50 + Math.sin(rad) * hsv.s * 50;

  return (
    <div className="wheel-wrap">
      <div className="wheel-stack">
        <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
          <canvas
            ref={wheelRef}
            className="wheel"
            style={{ width: SIZE, height: SIZE }}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging('wheel');
              pickFromWheel(e.clientX, e.clientY);
            }}
          />
          <div
            className="wheel-knob"
            style={{ left: `${knobX}%`, top: `${knobY}%`, background: hex }}
          />
        </div>

        <div style={{ width: SIZE }}>
          <label className="meta" style={{ display: 'block', marginBottom: 5 }}>
            Whites
          </label>
          <canvas
            ref={kelvinRef}
            className="kelvin-strip"
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging('kelvin');
              pickFromKelvin(e.clientX);
            }}
          />
        </div>
      </div>

      <div className="wheel-side">
        <div className="wheel-preview" style={{ background: hex, opacity: 0.25 + brightness * 0.75 }} />

        <div className="row">
          <input
            type="text"
            value={hex}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              if (/^#[0-9A-F]{6}$/.test(v)) onChange({ hex: v, brightness });
              else if (/^#?[0-9A-F]{0,6}$/.test(v)) onChange({ hex: v, brightness });
            }}
            style={{ fontFamily: 'ui-monospace, monospace' }}
            aria-label="Hex colour"
          />
        </div>

        {showBrightness && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Brightness — {Math.round(brightness * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={brightness}
              onChange={(e) => onChange({ hex, brightness: Number(e.target.value) })}
            />
          </div>
        )}

        <div>
          <label className="meta" style={{ display: 'block', marginBottom: 6 }}>
            Presets
          </label>
          <div className="swatch-row">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="swatch-chip"
                style={{ background: p }}
                title={p}
                onClick={() => onChange({ hex: p, brightness })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
