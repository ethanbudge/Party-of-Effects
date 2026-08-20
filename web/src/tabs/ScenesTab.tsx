import { useState } from 'react';
import { FolderBoard } from '../components/FolderBoard';
import type { TileData } from '../components/TileCard';
import { SceneEditor, type SceneDraft } from '../components/SceneEditor';
import { useFolders } from '../lib/useFolders';
import { sceneGradient } from '../lib/color';
import * as db from '../lib/data';
import type { GroupId, PartyEvent, Scene } from '../lib/types';

export function ScenesTab({
  scenes,
  reloadScenes,
  userId,
  groupId,
  displayName,
  send,
}: {
  scenes: Scene[];
  reloadScenes: () => Promise<void>;
  userId: string;
  groupId: GroupId;
  displayName: string;
  send: (event: PartyEvent) => void;
}) {
  const folders = useFolders('scene', userId, groupId);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [creating, setCreating] = useState(false);

  const tiles: TileData[] = scenes.map((s) => ({
    id: s.id,
    name: s.name,
    hero: sceneGradient(s.hex, s.brightness),
    meta: `${Math.round(s.brightness * 100)}% · ${s.playlist_uri ? 'playlist' : 'no playlist'}`,
  }));

  async function save(draft: SceneDraft) {
    if (editing) await db.updateScene(editing.id, draft);
    else await db.createScene({ ...draft, group_id: groupId, created_by: userId });
    await reloadScenes();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Scenes</h1>
        <span className="meta">
          {scenes.length} in the shared library · folders are yours alone
        </span>
      </div>

      <FolderBoard
        kind="scene"
        tiles={tiles}
        folders={folders.folders}
        folderItems={folders.items}
        onFire={(tile) => send({ type: 'scene', sceneId: tile.id, by: displayName })}
        onEdit={(tile) => {
          const scene = scenes.find((s) => s.id === tile.id);
          if (scene) setEditing(scene);
        }}
        onDelete={async (tile) => {
          await db.deleteScene(tile.id);
          await Promise.all([reloadScenes(), folders.reload()]);
        }}
        onCreateFolder={folders.createFolder}
        onRenameFolder={folders.renameFolder}
        onDeleteFolder={folders.deleteFolder}
        onPlace={folders.place}
        onMove={folders.move}
        onUnfile={folders.unfile}
      />

      <button className="fab" onClick={() => setCreating(true)}>
        <span className="fab-plus">+</span> New scene
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
