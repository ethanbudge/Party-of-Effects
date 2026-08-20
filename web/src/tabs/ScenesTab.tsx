import { useState } from 'react';
import { FolderBoard, type BoardItem } from '../components/FolderBoard';
import { SceneEditor, type SceneDraft } from '../components/SceneEditor';
import { useFolders } from '../lib/useFolders';
import * as db from '../lib/data';
import type { PartyEvent, Scene } from '../lib/types';

export function ScenesTab({
  scenes,
  reloadScenes,
  userId,
  displayName,
  send,
}: {
  scenes: Scene[];
  reloadScenes: () => Promise<void>;
  userId: string;
  displayName: string;
  send: (event: PartyEvent) => void;
}) {
  const folders = useFolders('scene', userId);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [creating, setCreating] = useState(false);

  const items: BoardItem[] = scenes.map((s) => ({
    id: s.id,
    name: s.name,
    swatch: s.hex,
    subtitle: s.playlist_uri ? `${s.name} — with playlist` : s.name,
  }));

  async function save(draft: SceneDraft) {
    if (editing) {
      await db.updateScene(editing.id, draft);
    } else {
      await db.createScene({ ...draft, created_by: userId });
    }
    await reloadScenes();
  }

  return (
    <div className="page">
      <FolderBoard
        kind="scene"
        items={items}
        folders={folders.folders}
        folderItems={folders.items}
        onFire={(item) => send({ type: 'scene', sceneId: item.id, by: displayName })}
        onEdit={(item) => {
          const scene = scenes.find((s) => s.id === item.id);
          if (scene) setEditing(scene);
        }}
        onDelete={async (item) => {
          await db.deleteScene(item.id);
          await Promise.all([reloadScenes(), folders.reload()]);
        }}
        onCreateFolder={folders.createFolder}
        onRenameFolder={folders.renameFolder}
        onDeleteFolder={folders.deleteFolder}
        onPlace={folders.place}
        onMove={folders.move}
        onUnfile={folders.unfile}
      />

      <button className="fab" onClick={() => setCreating(true)} title="New scene">
        +
      </button>

      {(creating || editing) && (
        <SceneEditor
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
