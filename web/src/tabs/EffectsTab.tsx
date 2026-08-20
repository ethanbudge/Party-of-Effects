import { useState } from 'react';
import { FolderBoard, type BoardItem } from '../components/FolderBoard';
import { EffectEditor, type EffectDraft } from '../components/EffectEditor';
import { useFolders } from '../lib/useFolders';
import * as db from '../lib/data';
import { evictSound } from '../lib/sequencer';
import type { Effect, Frame, PartyEvent } from '../lib/types';

/** Show the effect's most dramatic colour on its chip — usually the impact frame. */
function peakColour(frames: Frame[]): string | undefined {
  if (!frames.length) return undefined;
  return frames.reduce((best, f) => (f.brightness > best.brightness ? f : best)).hex;
}

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

  const items: BoardItem[] = effects.map((e) => ({
    id: e.id,
    name: e.name,
    swatch: peakColour(e.frames),
    subtitle: `${e.name} — ${(e.duration_ms / 1000).toFixed(2)}s, ${e.frames.length} frames`,
  }));

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
        sound_path: soundPath,
      });
    } else {
      await db.createEffect({
        name: draft.name,
        frames: draft.frames,
        revert_ms: draft.revert_ms,
        duration_ms: draft.duration_ms,
        sound_path: soundPath,
        created_by: userId,
      });
    }

    await reloadEffects();
  }

  return (
    <div className="page">
      <FolderBoard
        kind="effect"
        items={items}
        folders={folders.folders}
        folderItems={folders.items}
        // 400ms of head start gives every browser time to receive the message
        // and get its audio buffer queued before the sound is due to start.
        onFire={(item) =>
          send({ type: 'effect', effectId: item.id, leadMs: 400, by: displayName })
        }
        onEdit={(item) => {
          const effect = effects.find((e) => e.id === item.id);
          if (effect) setEditing(effect);
        }}
        onDelete={async (item) => {
          const effect = effects.find((e) => e.id === item.id);
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

      <button className="fab" onClick={() => setCreating(true)} title="New effect">
        +
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
