import type { Frame } from './types';

/** Clamp to [0,1]. */
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(...hexToRgb(hex));
export const hsvToHex = (h: number, s: number, v: number): string => rgbToHex(...hsvToRgb(h, s, v));

/**
 * Approximate blackbody colour for a colour temperature, so the white strip in
 * the picker matches what a LIFX bulb actually does in its Kelvin range
 * (roughly 1500K candlelight to 9000K cold daylight).
 *
 * Tanner Helland's piecewise fit — close enough to look right, and far cheaper
 * than a real spectral conversion.
 */
export function kelvinToHex(kelvin: number): string {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return rgbToHex(r, g, b);
}

/** LIFX bulbs accept roughly this Kelvin span. */
export const KELVIN_MIN = 1500;
export const KELVIN_MAX = 9000;

/**
 * Mix a colour toward black to represent brightness in a preview swatch.
 * Bulb brightness isn't the same as colour value, but for a thumbnail it reads
 * correctly: a 10% scene should look dim, not just tinted.
 */
export function withBrightness(hex: string, brightness: number): string {
  const [r, g, b] = hexToRgb(hex);
  // Floor at 0.18 so a very dim scene is still identifiable rather than black.
  const k = 0.18 + clamp01(brightness) * 0.82;
  return rgbToHex(r * k, g * k, b * k);
}

/**
 * Build a CSS gradient across an effect's frames, positioned by time.
 *
 * This is the effect's whole timeline at a glance — you can see the dark
 * build-up, the bright impact, and the decay, in the proportions they actually
 * play at.
 */
export function framesToGradient(frames: Frame[], durationMs: number): string {
  if (!frames.length) return 'linear-gradient(90deg, var(--bg-inset), var(--bg-inset))';

  const sorted = [...frames].sort((a, b) => a.t_ms - b.t_ms);
  const span = Math.max(durationMs, sorted[sorted.length - 1]!.t_ms, 1);

  const stops = sorted.map((f) => {
    const pct = clamp01(f.t_ms / span) * 100;
    return `${withBrightness(f.hex, f.brightness)} ${pct.toFixed(2)}%`;
  });

  // Anchor the ends so the first and last colours don't get cut off.
  const first = withBrightness(sorted[0]!.hex, sorted[0]!.brightness);
  const last = withBrightness(
    sorted[sorted.length - 1]!.hex,
    sorted[sorted.length - 1]!.brightness,
  );

  return `linear-gradient(90deg, ${first} 0%, ${stops.join(', ')}, ${last} 100%)`;
}

/** Single-colour scene hero: a soft vertical wash rather than a flat block. */
export function sceneGradient(hex: string, brightness: number): string {
  const base = withBrightness(hex, brightness);
  const { h, s, v } = hexToHsv(base);
  const top = hsvToHex(h, Math.max(0, s - 0.12), Math.min(1, v * 1.22));
  const bottom = hsvToHex(h, Math.min(1, s + 0.08), v * 0.72);
  return `linear-gradient(160deg, ${top} 0%, ${base} 52%, ${bottom} 100%)`;
}
