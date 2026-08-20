/**
 * Voice triggering.
 *
 * Listens on this machine only. When a trigger phrase is heard it fires the
 * matching effect through the normal broadcast path, exactly as clicking the
 * tile would — so recognition latency lands once, on the person speaking, and
 * never enters anyone else's sound/light sync.
 *
 * Two things shape the design:
 *
 * 1. **On-device by default.** Chrome can run recognition locally
 *    (`processLocally: true`), which keeps audio and transcripts on the
 *    machine and works offline. We require it unless the user explicitly opts
 *    into cloud recognition, so "does this send my audio anywhere" has a
 *    default answer of no.
 *
 * 2. **The API stops itself.** Continuous recognition ends after silence, and
 *    the single most common way a feature like this breaks is working for five
 *    minutes and then quietly dying. Everything below is built around
 *    restarting cleanly, with backoff so a hard failure can't become a hot
 *    loop.
 */

// ---------------------------------------------------------------------------
// Minimal typings — TS's DOM lib has no SpeechRecognition, and nothing has the
// on-device additions yet.
// ---------------------------------------------------------------------------

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
  available?(opts: { langs: string[]; processLocally?: boolean }): Promise<Availability>;
  install?(opts: { langs: string[]; processLocally?: boolean }): Promise<boolean>;
}

function ctor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const isVoiceSupported = (): boolean => ctor() !== null;

/** Whether this browser exposes the on-device additions at all. */
export const supportsOnDevice = (): boolean => typeof ctor()?.available === 'function';

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

/**
 * Offered languages. Which of these actually work on-device is browser- and
 * machine-specific, so the UI asks `availability()` per language rather than
 * trusting this list — it is a menu, not a promise.
 */
export const VOICE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-419', label: 'Spanish (Latin America)' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'pl-PL', label: 'Polish' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'tr-TR', label: 'Turkish' },
  { code: 'sv-SE', label: 'Swedish' },
  { code: 'da-DK', label: 'Danish' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'hi-IN', label: 'Hindi' },
];

/** Is this language ready to run locally? */
export async function availability(lang: string): Promise<Availability> {
  const C = ctor();
  if (!C?.available) return 'unavailable';
  try {
    return await C.available({ langs: [lang], processLocally: true });
  } catch {
    return 'unavailable';
  }
}

/**
 * Download the on-device model for a language.
 *
 * Chrome manages the file itself — it is not stored in the app and does not
 * count against your Supabase storage. Resolves true once usable.
 */
export async function installLanguage(lang: string): Promise<boolean> {
  const C = ctor();
  if (!C?.install) return false;
  try {
    return await C.install({ langs: [lang], processLocally: true });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Fold a phrase to something comparable: lowercase, no accents, no
 * punctuation, single spaces.
 *
 * Accent folding matters — a French trigger typed as "Décharge" may come back
 * from the recogniser as "decharge", and the two must match.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word containment, so "ice" doesn't fire inside "nice". */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const i = haystack.indexOf(needle);
  if (i === -1) return false;
  const before = i === 0 ? ' ' : haystack[i - 1]!;
  const afterIdx = i + needle.length;
  const after = afterIdx >= haystack.length ? ' ' : haystack[afterIdx]!;
  return before === ' ' && after === ' ';
}

export interface TriggerBinding {
  effectId: string;
  name: string;
  phrases: string[];
}

// ---------------------------------------------------------------------------
// Listener
// ---------------------------------------------------------------------------

export type VoiceStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'suspended'
  | 'denied'
  | 'error'
  | 'unsupported';

export interface VoiceHandle {
  stop(): void;
  /** Swap the trigger list without tearing down the microphone. */
  setBindings(bindings: TriggerBinding[]): void;
  /** Ignore audio for a while — used to stop effect playback self-triggering. */
  suppressFor(ms: number): void;
}

/** One utterance shouldn't fire the same effect twice as its interim text grows. */
const COOLDOWN_MS = 2500;

export function startListening(opts: {
  lang: string;
  processLocally: boolean;
  bindings: TriggerBinding[];
  onMatch: (binding: TriggerBinding, heard: string) => void;
  onStatus: (status: VoiceStatus, detail?: string) => void;
  onHeard?: (text: string) => void;
}): VoiceHandle {
  const C = ctor();
  if (!C) {
    opts.onStatus('unsupported');
    return { stop: () => {}, setBindings: () => {}, suppressFor: () => {} };
  }

  let bindings = opts.bindings;
  let stopped = false;
  let suppressedUntil = 0;
  let restartDelay = 250;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  const lastFired = new Map<string, number>();

  const rec = new C();
  rec.lang = opts.lang;
  rec.continuous = true;
  // Interim results are what make this feel immediate: a trigger fires as the
  // word is recognised rather than after Chrome decides the sentence ended.
  // The cooldown below absorbs the repeats this causes.
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  if (opts.processLocally) rec.processLocally = true;

  rec.onstart = () => {
    restartDelay = 250;
    opts.onStatus('listening');
  };

  rec.onresult = (event) => {
    if (stopped) return;
    if (Date.now() < suppressedUntil) return;

    let text = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += ' ' + (event.results[i]?.[0]?.transcript ?? '');
    }

    const heard = normalise(text);
    if (!heard) return;
    opts.onHeard?.(heard);

    const now = Date.now();
    for (const binding of bindings) {
      if (now - (lastFired.get(binding.effectId) ?? 0) < COOLDOWN_MS) continue;

      for (const phrase of binding.phrases) {
        if (containsPhrase(heard, phrase)) {
          lastFired.set(binding.effectId, now);
          opts.onMatch(binding, heard);
          break;
        }
      }
    }
  };

  rec.onerror = (e) => {
    if (stopped) return;

    switch (e.error) {
      case 'not-allowed':
      case 'service-not-allowed':
        // Permission refused or revoked. Restarting would just re-prompt.
        stopped = true;
        opts.onStatus('denied', 'Microphone permission was refused.');
        return;
      case 'no-speech':
      case 'aborted':
        // Routine; onend restarts us.
        return;
      case 'audio-capture':
        opts.onStatus('error', 'No microphone found.');
        return;
      case 'network':
        opts.onStatus('error', 'Speech service unreachable.');
        return;
      default:
        opts.onStatus('error', e.error);
    }
  };

  // The heart of it: the service disconnects on its own, constantly. Restart
  // unless we were told to stop, backing off so a persistent failure settles
  // into an occasional retry rather than spinning.
  rec.onend = () => {
    if (stopped) return;
    opts.onStatus('starting');
    restartTimer = setTimeout(() => {
      if (stopped) return;
      try {
        rec.start();
      } catch {
        // start() throws if it is somehow already running; the next onend
        // will bring us back around.
      }
    }, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 10_000);
  };

  opts.onStatus('starting');
  try {
    rec.start();
  } catch (err) {
    opts.onStatus('error', (err as Error).message);
  }

  return {
    stop() {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* already down */
      }
      opts.onStatus('idle');
    },
    setBindings(next) {
      bindings = next;
    },
    suppressFor(ms) {
      suppressedUntil = Math.max(suppressedUntil, Date.now() + ms);
    },
  };
}

/** Build the match list from effects, pre-normalised so matching stays cheap. */
export function bindingsFrom(
  effects: { id: string; name: string; trigger_words: string[] | null }[],
): TriggerBinding[] {
  const out: TriggerBinding[] = [];
  for (const e of effects) {
    const phrases = (e.trigger_words ?? []).map(normalise).filter(Boolean);
    if (phrases.length) out.push({ effectId: e.id, name: e.name, phrases });
  }
  return out;
}
