import { currentAccessToken } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await currentAccessToken();
  if (!token) throw new ApiError('Not signed in', 401);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};

  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export interface LifxLight {
  id: string;
  label: string;
  connected: boolean;
  power: string;
}

export const api = {
  status: () => request<{ lifx: boolean; spotify: boolean }>('/api/credentials/status'),

  connectLifx: (token: string) =>
    request<{ ok: true; lights: { id: string; label: string }[] }>('/api/credentials/lifx', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  disconnectLifx: () => request<{ ok: true }>('/api/credentials/lifx', { method: 'DELETE' }),
  disconnectSpotify: () => request<{ ok: true }>('/api/credentials/spotify', { method: 'DELETE' }),

  lifxLights: () => request<{ lights: LifxLight[] }>('/api/lifx/lights'),

  /**
   * Set this user's own lights. Returns the round-trip time LIFX took, which
   * the sequencer folds into its latency estimate.
   */
  setLight: (body: {
    hex?: string;
    brightness?: number;
    durationMs?: number;
    power?: 'on' | 'off';
    fast?: boolean;
    selector?: string;
  }) =>
    request<{ ok: true; elapsed: number }>('/api/lifx/state', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  spotifyAuthorizeUrl: () => request<{ url: string }>('/api/spotify/authorize'),
  spotifyToken: () => request<{ accessToken: string }>('/api/spotify/token'),

  spotifyPlay: (body: { contextUri?: string; deviceId?: string; positionMs?: number }) =>
    request<{ ok: true }>('/api/spotify/play', { method: 'PUT', body: JSON.stringify(body) }),

  spotifyPause: () => request<{ ok: true }>('/api/spotify/pause', { method: 'PUT' }),
  spotifyResume: () => request<{ ok: true }>('/api/spotify/play', { method: 'PUT', body: '{}' }),
  spotifyNext: () => request<{ ok: true }>('/api/spotify/next', { method: 'POST' }),
  spotifyPrevious: () => request<{ ok: true }>('/api/spotify/previous', { method: 'POST' }),
};
