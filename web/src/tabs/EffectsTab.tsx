import { useState } from 'react';
import { FolderBoard } from '../components/FolderBoard';
import type { TileData } from '../components/TileCard';
import { EffectEditor, type EffectDraft } from '../components/EffectEditor';
import { useFolders } from '../lib/useFolders';
import { framesToGradient } from '../lib/color';
import * as db from '../lib/data';
import { evictSound } from '../lib/sequencer';
import type { Effect, PartyEvent } from '../lib/types';

export function EffectsTab({
  effects,
  reloadEffects,
  userId,
  displayName,
  send,
}: {
  effects: Effect[];
  reloadEffects: () => Promise<void>;
  userId: string;
  displayName: string;
  send: (event: PartyEvent) => void;
}) {
  const folders = useFolders('effect', userId);
  const [editing, setEditing] = useState<Effect | null>(null);
  const [creating, setCreating] = useState(false);

  const tiles: TileData[] = effects.map((e) => {
    const span = Math.max(e.duration_ms, 1);
    return {
      id: e.id,
      name: e.name,
      hero: framesToGradient(e.frames, e.duration_ms),
      meta: `${(e.duration_ms / 1000).toFixed(2)}s · ${e.frames.length} frames${
        e.sound_path ? '' : ' · silent'
      }${e.trigger_words.length ? ' · 🎙' : ''}`,
      ticks: e.frames.map((f) => Math.min(1, f.t_ms / span)),
    };
  });

  async function save(draft: EffectDraft) {
    let soundPath = editing?.sound_path ?? null;

    if (draft.file) {
      soundPath = await db.uploadSound(draft.file, userId);
      // Drop the stale decoded buffer so the next trigger fetches the new one.
      if (editing) evictSound(editing.id);
    }

    if (editing) {
      await db.updateEffect(editing.id, {
        name: draft.name,
        frames: draft.frames,
        revert_ms: draft.revert_ms,
        duration_ms: draft.duration_ms,
        trigger_words: draft.trigger_words,
        sound_path: soundPath,
      });
    } else {
      await db.createEffect({
        name: draft.name,
        frames: draft.frames,
        revert_ms: draft.revert_ms,
        duration_ms: draft.duration_ms,
        trigger_words: draft.trigger_words,
        sound_path: soundPath,
        created_by: userId,
      });
    }

    await reloadEffects();
  }

  const silent = effects.filter((e) => !e.sound_path).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Effects</h1>
        <span className="meta">
          {effects.length} in the shared library
          {silent > 0 && ` · ${silent} still need a sound file`}
        </span>
      </div>

      <FolderBoard
        kind="effect"
        tiles={tiles}
        folders={folders.folders}
        folderItems={folders.items}
        // 400ms of head start gives every browser time to receive the message
        // and queue its audio before the sound is due to start.
        onFire={(tile) => send({ type: 'effect', effectId: tile.id, leadMs: 400, by: displayName })}
        onEdit={(tile) => {
          const effect = effects.find((e) => e.id === tile.id);
          if (effect) setEditing(effect);
        }}
        onDelete={async (tile) => {
          const effect = effects.find((e) => e.id === tile.id);
          if (!effect) return;
          await db.deleteEffect(effect);
          evictSound(effect.id);
          await Promise.all([reloadEffects(), folders.reload()]);
        }}
        onCreateFolder={folders.createFolder}
        onRenameFolder={folders.renameFolder}
        onDeleteFolder={folders.deleteFolder}
        onPlace={folders.place}
        onMove={folders.move}
        onUnfile={folders.unfile}
      />

      <button className="fab" onClick={() => setCreating(true)}>
        <span className="fab-plus">+</span> New effect
      </button>

      {(creating || editing) && (
        <EffectEditor
          existing={editing ?? undefined}
          onSave={save}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
