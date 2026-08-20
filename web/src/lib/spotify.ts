import { api } from './api';

/**
 * Spotify playback via the Web Playback SDK.
 *
 * Why the SDK rather than "control whatever Spotify app they have open":
 * it turns this browser tab itself into a Spotify Connect device. Nobody has
 * to remember to open the desktop app first, and we always have a device id
 * to target, which removes the single most common failure mode of the Web API
 * playback endpoints ("no active device").
 *
 * Requires Spotify Premium — that's Spotify's restriction on playback control,
 * not something we can work around.
 *
 * Spotify Jam has no public API of any kind, so this is the closest thing:
 * every person's own account plays the same playlist at the same moment.
 */

// `window.Spotify` and `window.onSpotifyWebPlaybackSDKReady` are declared by
// @types/spotify-web-playback-sdk — no local declaration needed.

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();

    window.onSpotifyWebPlaybackSDKReady = () => resolve();

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => reject(new Error('Could not load the Spotify Web Playback SDK'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export interface PlayerHandle {
  deviceId: string;
  player: Spotify.Player;
  disconnect(): void;
}

let handle: PlayerHandle | null = null;

export function currentPlayer(): PlayerHandle | null {
  return handle;
}

export async function initPlayer(opts: {
  name?: string;
  onError?: (message: string) => void;
}): Promise<PlayerHandle> {
  if (handle) return handle;

  await loadSdk();

  const player = new window.Spotify.Player({
    name: opts.name ?? 'Party of Effects',
    volume: 0.6,
    getOAuthToken: (cb) => {
      // Fetched fresh each time the SDK asks, so an expiring token is
      // transparently replaced without the user noticing.
      api
        .spotifyToken()
        .then(({ accessToken }) => cb(accessToken))
        .catch(() => opts.onError?.('Could not get a Spotify token. Reconnect Spotify.'));
    },
  });

  player.addListener('initialization_error', ({ message }) => opts.onError?.(message));
  player.addListener('authentication_error', ({ message }) => opts.onError?.(message));
  player.addListener('account_error', () =>
    opts.onError?.('Spotify Premium is required for in-browser playback.'),
  );
  player.addListener('playback_error', ({ message }) => opts.onError?.(message));

  const deviceId = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Spotify player did not become ready')), 15000);

    player.addListener('ready', ({ device_id }) => {
      clearTimeout(timeout);
      resolve(device_id);
    });

    player.connect().then((ok) => {
      if (!ok) {
        clearTimeout(timeout);
        reject(new Error('Spotify player refused to connect'));
      }
    });
  });

  handle = {
    deviceId,
    player,
    disconnect() {
      player.disconnect();
      handle = null;
    },
  };

  return handle;
}

/** Start a playlist on this user's own account, in this tab. */
export async function playContext(contextUri: string): Promise<void> {
  const h = handle ?? (await initPlayer({}));
  await api.spotifyPlay({ contextUri, deviceId: h.deviceId });
}

export async function pause(): Promise<void> {
  await api.spotifyPause();
}

/**
 * Accepts anything a person is likely to paste — an open.spotify.com link,
 * a `spotify:playlist:...` URI, or a bare id — and normalises it.
 */
export function normalisePlaylistUri(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^spotify:(playlist|album|artist):[A-Za-z0-9]+$/.test(trimmed)) return trimmed;

  const urlMatch = trimmed.match(
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|artist)\/([A-Za-z0-9]+)/,
  );
  if (urlMatch) return `spotify:${urlMatch[1]}:${urlMatch[2]}`;

  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return `spotify:playlist:${trimmed}`;

  return null;
}
