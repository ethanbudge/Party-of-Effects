import { supabase } from './supabase';
import type { Effect, Folder, FolderItem, Frame, Kind, Profile, Scene } from './types';

const BUCKET = 'effect-sounds';

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export async function listScenes(): Promise<Scene[]> {
  const { data, error } = await supabase.from('scenes').select('*').order('name');
  if (error) throw error;
  return data as Scene[];
}

export async function createScene(input: {
  name: string;
  hex: string;
  brightness: number;
  playlist_uri: string | null;
  created_by: string;
}): Promise<Scene> {
  const { data, error } = await supabase.from('scenes').insert(input).select().single();
  if (error) throw error;
  return data as Scene;
}

export async function updateScene(id: string, patch: Partial<Scene>): Promise<void> {
  const { error } = await supabase.from('scenes').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteScene(id: string): Promise<void> {
  const { error } = await supabase.from('scenes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export async function listEffects(): Promise<Effect[]> {
  const { data, error } = await supabase.from('effects').select('*').order('name');
  if (error) throw error;
  return (data as Effect[]).map((e) => ({ ...e, frames: (e.frames ?? []) as Frame[] }));
}

export async function createEffect(input: {
  name: string;
  sound_path: string | null;
  duration_ms: number;
  frames: Frame[];
  revert_ms: number;
  created_by: string;
}): Promise<Effect> {
  const { data, error } = await supabase.from('effects').insert(input).select().single();
  if (error) throw error;
  return data as Effect;
}

export async function updateEffect(id: string, patch: Partial<Effect>): Promise<void> {
  const { error } = await supabase.from('effects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteEffect(effect: Effect): Promise<void> {
  if (effect.sound_path) {
    // Best-effort: an orphaned sound file is harmless, a failed delete isn't.
    await supabase.storage.from(BUCKET).remove([effect.sound_path]);
  }
  const { error } = await supabase.from('effects').delete().eq('id', effect.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sound storage
// ---------------------------------------------------------------------------

export async function uploadSound(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'wav';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'audio/wav',
    upsert: false,
  });
  if (error) throw error;

  return path;
}

/** Signed URL for a private sound file. Valid for an hour — plenty per session. */
export async function soundUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Folders (per person)
// ---------------------------------------------------------------------------

export async function listFolders(kind: Kind): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('kind', kind)
    .order('position');
  if (error) throw error;
  return data as Folder[];
}

export async function createFolder(input: {
  name: string;
  kind: Kind;
  owner_id: string;
  position: number;
}): Promise<Folder> {
  const { data, error } = await supabase.from('folders').insert(input).select().single();
  if (error) throw error;
  return data as Folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('folders').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  // folder_items cascade on delete, so the items simply return to the library.
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export async function listFolderItems(kind: Kind): Promise<FolderItem[]> {
  const { data, error } = await supabase
    .from('folder_items')
    .select('*')
    .eq('kind', kind)
    .order('position');
  if (error) throw error;
  return data as FolderItem[];
}

/**
 * Place an item in a folder. The unique constraint on
 * (owner_id, folder_id, kind, item_id) makes a repeat drop a no-op rather
 * than a duplicate row.
 */
export async function placeItem(input: {
  owner_id: string;
  folder_id: string;
  kind: Kind;
  item_id: string;
  position: number;
}): Promise<void> {
  const { error } = await supabase
    .from('folder_items')
    .upsert(input, { onConflict: 'owner_id,folder_id,kind,item_id' });
  if (error) throw error;
}

export async function removeItemFromFolder(id: string): Promise<void> {
  const { error } = await supabase.from('folder_items').delete().eq('id', id);
  if (error) throw error;
}

export async function moveItem(id: string, folderId: string, position: number): Promise<void> {
  const { error } = await supabase
    .from('folder_items')
    .update({ folder_id: folderId, position })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name');
  if (error) throw error;
  return data as Profile[];
}

export async function updateDisplayName(id: string, display_name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ display_name }).eq('id', id);
  if (error) throw error;
}
