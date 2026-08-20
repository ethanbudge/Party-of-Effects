export type Kind = 'scene' | 'effect';

export interface Scene {
  id: string;
  name: string;
  hex: string;
  brightness: number;
  playlist_uri: string | null;
  created_by: string | null;
  created_at: string;
}

/** One keyframe in an effect's light timeline. */
export interface Frame {
  /** Milliseconds from the start of the sound. */
  t_ms: number;
  hex: string;
  brightness: number;
  /** LIFX transition duration into this colour. */
  fade_ms: number;
}

export interface Effect {
  id: string;
  name: string;
  sound_path: string | null;
  duration_ms: number;
  frames: Frame[];
  revert_ms: number;
  created_by: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  kind: Kind;
  position: number;
}

export interface FolderItem {
  id: string;
  owner_id: string;
  folder_id: string;
  kind: Kind;
  item_id: string;
  position: number;
}

export interface Profile {
  id: string;
  display_name: string;
}

/** Messages sent over the Supabase Realtime broadcast channel. */
export type PartyEvent =
  | { type: 'effect'; effectId: string; leadMs: number; by: string }
  | { type: 'scene'; sceneId: string; by: string }
  | {
      type: 'light';
      hex: string;
      brightness: number;
      durationMs: number;
      power?: 'on' | 'off';
      by: string;
    }
  | { type: 'music'; contextUri: string | null; by: string };
