export type Kind = 'scene' | 'effect';

export interface Group {
  id: string;
  name: string;
  role: 'owner' | 'member';
  isOwner: boolean;
}

export interface GroupMember {
  userId: string;
  role: 'owner' | 'member';
  displayName: string;
}

/**
 * Which library you are looking at. `null` is solo mode: a private library
 * only you can see, and no live channel at all.
 */
export type GroupId = string | null;

export interface Scene {
  id: string;
  name: string;
  hex: string;
  brightness: number;
  playlist_uri: string | null;
  /** Null means private to created_by; set means shared with that group. */
  group_id: string | null;
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
  /** Spoken phrases that fire this effect. Shared with the group. */
  trigger_words: string[];
  /** Null means private to created_by; set means shared with that group. */
  group_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  kind: Kind;
  /** Folders are private per person AND per group. */
  group_id: string | null;
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

export interface UserSettings {
  user_id: string;
  /** Scales every light command this person issues. 1 = no cap. */
  max_brightness: number;
  /** LIFX light ids to control. Null or empty means all of them. */
  light_ids: string[] | null;
  /** Listen for trigger words on this machine. Off unless asked for. */
  voice_enabled: boolean;
  /** BCP-47 tag, e.g. 'fr-FR'. */
  voice_language: string;
  /** Permit cloud recognition when no on-device model is available. */
  voice_allow_cloud: boolean;
  /** The group currently being viewed. Null = solo. */
  active_group_id: string | null;
}

export type MusicAction = 'play' | 'pause' | 'resume' | 'next' | 'previous';

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
  | { type: 'music'; action: MusicAction; contextUri?: string; by: string };
