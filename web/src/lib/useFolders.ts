import { useCallback, useEffect, useState } from 'react';
import * as db from './data';
import type { Folder, FolderItem, GroupId, Kind } from './types';

/**
 * Per-person folder state for one tab.
 *
 * Folders and their contents are scoped to the signed-in user by RLS, so this
 * hook never has to filter by owner — the database only ever returns your own
 * rows in the first place.
 */
export function useFolders(kind: Kind, userId: string, groupId: GroupId) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      // Items are fetched by folder id rather than by group, because
      // folder_items has no group column — it inherits scope from its folder.
      const f = await db.listFolders(kind, groupId);
      const i = await db.listFolderItems(kind, f.map((x) => x.id));
      setFolders(f);
      setItems(i);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [kind, groupId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createFolder = useCallback(
    async (name: string) => {
      await db.createFolder({
        name,
        kind,
        owner_id: userId,
        group_id: groupId,
        position: folders.length,
      });
      await reload();
    },
    [kind, userId, groupId, folders.length, reload],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await db.renameFolder(id, name);
      await reload();
    },
    [reload],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await db.deleteFolder(id);
      await reload();
    },
    [reload],
  );

  const place = useCallback(
    async (itemId: string, folderId: string) => {
      const position = items.filter((i) => i.folder_id === folderId).length;
      await db.placeItem({ owner_id: userId, folder_id: folderId, kind, item_id: itemId, position });
      await reload();
    },
    [items, userId, kind, reload],
  );

  const move = useCallback(
    async (entryId: string, folderId: string) => {
      const position = items.filter((i) => i.folder_id === folderId).length;
      await db.moveItem(entryId, folderId, position);
      await reload();
    },
    [items, reload],
  );

  const unfile = useCallback(
    async (entryId: string) => {
      await db.removeItemFromFolder(entryId);
      await reload();
    },
    [reload],
  );

  return {
    folders,
    items,
    error,
    reload,
    createFolder,
    renameFolder,
    deleteFolder,
    place,
    move,
    unfile,
  };
}
