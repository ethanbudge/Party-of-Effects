import { api } from './api';
import type { Effect, Frame } from './types';

/**
 * The audio + light sync engine.
 *
 * The whole design goal here: for any ONE person, their sound and their light
 * flash must land together. Cross-person alignment is best-effort and doesn't
 * need to be tight.
 *
 * That goal dictates the architecture. The browser owns the clock, not the
 * server. Audio is scheduled on the Web Audio clock (sample-accurate), and
 * light frames are polled against that same clock and fired early by however
 * long a LIFX round trip actually takes from this machine. If the server drove
 * the timeline instead, sound and light would be running on two different
 * clocks with a network link between them, and they'd drift apart.
 */

// ---------------------------------------------------------------------------
// Audio context
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * Browsers refuse to start audio until the user has interacted with the page.
 * Call this from a click handler once, early.
 */
export async function unlockAudio(): Promise<void> {
  const c = getAudioContext();
  if (c.state === 'suspended') await c.resume();
}

// ---------------------------------------------------------------------------
// Sound buffer cache
// ---------------------------------------------------------------------------

const bufferCache = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer>>();

/**
 * Decode and cache a sound.
 *
 * Effects are preloaded at app start rather than fetched on trigger — a
 * network fetch in the trigger path would blow the timing budget entirely.
 */
export function loadSound(key: string, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch sound (${res.status})`);
    const bytes = await res.arrayBuffer();
    const buf = await getAudioContext().decodeAudioData(bytes);
    bufferCache.set(key, buf);
    inflight.delete(key);
    return buf;
  })();

  inflight.set(key, p);
  return p;
}

export function getCachedSound(key: string): AudioBuffer | undefined {
  return bufferCache.get(key);
}

export function evictSound(key: string): void {
  bufferCache.delete(key);
  inflight.delete(key);
}

/** Decode a local File (used by the effect editor before upload). */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  return getAudioContext().decodeAudioData(bytes);
}

// ---------------------------------------------------------------------------
// Latency compensation
// ---------------------------------------------------------------------------

const CALIBRATION_KEY = 'poe.lightOffsetMs';

/**
 * Rolling estimate of how long it takes from "we decide to change the light"
 * to "the bulb actually changes" — browser -> our API -> LIFX cloud -> bulb.
 *
 * Seeded at 250ms because LIFX's cloud API is genuinely not fast, then
 * corrected by real measurements as the session goes on.
 */
let latencyEma = 250;

function recordLatency(ms: number): void {
  // Ignore wild outliers so one stalled request doesn't poison the estimate.
  if (ms > 3000) return;
  latencyEma = latencyEma * 0.8 + ms * 0.2;
}

export function measuredLatencyMs(): number {
  return Math.round(latencyEma);
}

/** User-tunable nudge, in ms. Positive fires lights earlier. */
export function calibrationOffsetMs(): number {
  const raw = localStorage.getItem(CALIBRATION_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setCalibrationOffsetMs(ms: number): void {
  localStorage.setItem(CALIBRATION_KEY, String(ms));
}

function leadMs(): number {
  return Math.max(0, latencyEma + calibrationOffsetMs());
}

// ---------------------------------------------------------------------------
// Light dispatch
// ---------------------------------------------------------------------------

export interface LightState {
  hex: string;
  brightness: number;
  durationMs: number;
}

/** Whatever scene is currently active — effects fade back to this. */
let ambient: LightState = { hex: '#E0D4CC', brightness: 0.1, durationMs: 2000 };

export function setAmbient(state: LightState): void {
  ambient = state;
}

export function getAmbient(): LightState {
  return ambient;
}

/**
 * Per-person light preferences, applied to every outgoing command.
 *
 * This is the one place light commands leave the app, so capping brightness
 * and limiting which bulbs are touched here covers effects, scenes, and the
 * General tab alike — and it always uses the settings of the person whose
 * bulb is changing, never whoever pressed the button.
 */
export interface LightProfile {
  /** Scales every brightness. 0.8 means an effect's 50% lands at 40%. */
  maxBrightness: number;
  /** LIFX selector, e.g. `all` or `id:d073d5aa,id:d073d5bb`. */
  selector: string;
}

let lightProfile: LightProfile = { maxBrightness: 1, selector: 'all' };

export function setLightProfile(p: LightProfile): void {
  lightProfile = p;
}

export function getLightProfile(): LightProfile {
  return lightProfile;
}

async function sendLight(
  hex: string,
  brightness: number,
  durationMs: number,
  power?: 'on' | 'off',
): Promise<void> {
  const scaled =
    Math.max(0, Math.min(1, brightness)) * Math.max(0, Math.min(1, lightProfile.maxBrightness));

  const t0 = performance.now();
  try {
    await api.setLight({
      hex,
      brightness: scaled,
      durationMs,
      power,
      fast: true,
      selector: lightProfile.selector,
    });
    recordLatency(performance.now() - t0);
  } catch (err) {
    // A dropped frame mid-effect should never abort the rest of the sequence.
    console.warn('[light] frame failed', err);
  }
}

/** Immediate one-off light change (General tab, scene cues). */
export async function applyLight(state: LightState, power?: 'on' | 'off'): Promise<void> {
  await sendLight(state.hex, state.brightness, state.durationMs, power);
}

// ---------------------------------------------------------------------------
// The sequencer
// ---------------------------------------------------------------------------

const TICK_MS = 20;

export interface RunHandle {
  cancel(): void;
}

let activeRun: RunHandle | null = null;

/**
 * Play one effect: start the sound and walk its light timeline alongside it.
 *
 * `startDelayMs` lets a broadcast add a shared head start so everyone in the
 * party fires at roughly the same wall-clock moment.
 */
export function runEffect(
  effect: Effect,
  buffer: AudioBuffer | undefined,
  opts: {
    startDelayMs?: number;
    onFrame?: (i: number) => void;
    /** Elapsed ms relative to the sound's start; negative during the lead-in.
     *  Called once more with `null` when the run finishes or is cancelled. */
    onProgress?: (ms: number | null) => void;
  } = {},
): RunHandle {
  // Only one effect at a time — overlapping sequences fight over the bulb.
  activeRun?.cancel();

  const c = getAudioContext();
  const lead = leadMs() / 1000;

  // Give ourselves enough runway that a frame at t=0 can still be sent early.
  const prep = Math.max(0.12, lead + 0.05) + (opts.startDelayMs ?? 0) / 1000;
  const startAt = c.currentTime + prep;

  let source: AudioBufferSourceNode | null = null;
  if (buffer) {
    source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(startAt);
  }

  const frames: Frame[] = [...effect.frames].sort((a, b) => a.t_ms - b.t_ms);

  // Absolute audio-clock time at which each frame's HTTP call should GO OUT.
  // Subtracting `lead` is the entire trick: the request leaves early so the
  // bulb changes at the instant the audio reaches that timestamp.
  const sendAt = frames.map((f) => startAt + f.t_ms / 1000 - lead);

  let next = 0;
  let cancelled = false;

  const revertAt =
    startAt +
    Math.max(effect.duration_ms, frames.length ? frames[frames.length - 1]!.t_ms : 0) / 1000 -
    lead;
  let reverted = false;

  const timer = setInterval(() => {
    if (cancelled) return;
    const now = c.currentTime;

    opts.onProgress?.((now - startAt) * 1000);

    while (next < frames.length && sendAt[next]! <= now) {
      const f = frames[next]!;
      void sendLight(f.hex, f.brightness, f.fade_ms);
      opts.onFrame?.(next);
      next++;
    }

    if (!reverted && now >= revertAt) {
      reverted = true;
      void sendLight(ambient.hex, ambient.brightness, effect.revert_ms);
    }

    if (next >= frames.length && reverted) {
      clearInterval(timer);
      opts.onProgress?.(null);
      if (activeRun === handle) activeRun = null;
    }
  }, TICK_MS);

  const handle: RunHandle = {
    cancel() {
      cancelled = true;
      clearInterval(timer);
      opts.onProgress?.(null);
      try {
        source?.stop();
      } catch {
        /* already stopped */
      }
      if (activeRun === handle) activeRun = null;
    },
  };

  activeRun = handle;
  return handle;
}

export function cancelActiveEffect(): void {
  activeRun?.cancel();
}
