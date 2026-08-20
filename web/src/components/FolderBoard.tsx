import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { TileCard, type TileData } from './TileCard';
import type { Folder, FolderItem, Kind } from '../lib/types';

const LIBRARY_ID = '__library__';

function FolderCard({
  folder,
  items,
  onFire,
  onRemoveItem,
  onRename,
  onDelete,
}: {
  folder: Folder;
  items: { entry: FolderItem; tile: TileData }[];
  onFire: (tile: TileData) => void;
  onRemoveItem: (entryId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });

  return (
    <div ref={setNodeRef} className={isOver ? 'folder over' : 'folder'}>
      <div className="folder-head">
        <span className="folder-name">{folder.name}</span>
        <span className="folder-count">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        <span className="spacer" />
        <button
          className="icon-btn"
          title="Rename folder"
          onClick={() => {
            const name = window.prompt('Folder name', folder.name);
            if (name?.trim()) onRename(folder.id, name.trim());
          }}
        >
          ✎
        </button>
        <button
          className="icon-btn danger"
          title="Delete folder"
          onClick={() => {
            if (window.confirm(`Delete "${folder.name}"? Its contents return to the library.`)) {
              onDelete(folder.id);
            }
          }}
        >
          ✕
        </button>
      </div>

      {items.length === 0 ? (
        <div className="folder-empty">Drag a tile here</div>
      ) : (
        <div className="tile-grid">
          {items.map(({ entry, tile }) => (
            <TileCard
              key={entry.id}
              tile={tile}
              dragId={`entry:${entry.id}`}
              onFire={() => onFire(tile)}
              onRemove={() => onRemoveItem(entry.id)}
              removeTitle="Take out of this folder"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryDrawer({
  kind,
  tiles,
  onFire,
  onEdit,
  onDelete,
}: {
  kind: Kind;
  tiles: TileData[];
  onFire: (tile: TileData) => void;
  onEdit: (tile: TileData) => void;
  onDelete: (tile: TileData) => void;
}) {
  const [open, setOpen] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: LIBRARY_ID });

  return (
    <div ref={setNodeRef} className={`drawer${isOver ? ' over' : ''}`}>
      <button className="drawer-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▼' : '▶'}</span>
        All {kind === 'scene' ? 'scenes' : 'effects'}
        <span className="folder-count" style={{ marginLeft: 'auto' }}>
          {tiles.length}
        </span>
      </button>

      {open && (
        <div className="drawer-body">
          {tiles.length === 0 ? (
            <div className="empty-state">
              Nothing here yet — use the button in the corner to create one.
            </div>
          ) : (
            <div className="tile-grid">
              {tiles.map((tile) => (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  dragId={`item:${tile.id}`}
                  onFire={() => onFire(tile)}
                  onEdit={() => onEdit(tile)}
                  onRemove={() => {
                    if (window.confirm(`Delete "${tile.name}" for everyone?`)) onDelete(tile);
                  }}
                  removeTitle="Delete for everyone"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FolderBoard({
  kind,
  tiles,
  folders,
  folderItems,
  onFire,
  onEdit,
  onDelete,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onPlace,
  onMove,
  onUnfile,
}: {
  kind: Kind;
  tiles: TileData[];
  folders: Folder[];
  folderItems: FolderItem[];
  onFire: (tile: TileData) => void;
  onEdit: (tile: TileData) => void;
  onDelete: (tile: TileData) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onPlace: (itemId: string, folderId: string) => void;
  onMove: (entryId: string, folderId: string) => void;
  onUnfile: (entryId: string) => void;
}) {
  const [dragging, setDragging] = useState<TileData | null>(null);

  const sensors = useSensors(
    // Small activation distance so a click on the hero still counts as a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);

  const grouped = useMemo(() => {
    const map = new Map<string, { entry: FolderItem; tile: TileData }[]>();
    for (const f of folders) map.set(f.id, []);
    for (const entry of folderItems) {
      const tile = byId.get(entry.item_id);
      if (tile) map.get(entry.folder_id)?.push({ entry, tile });
    }
    return map;
  }, [folders, folderItems, byId]);

  function handleStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('item:')) {
      setDragging(byId.get(id.slice(5)) ?? null);
    } else {
      const entry = folderItems.find((f) => f.id === id.slice(6));
      setDragging(entry ? (byId.get(entry.item_id) ?? null) : null);
    }
  }

  function handleEnd(e: DragEndEvent) {
    setDragging(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    const activeId = String(e.active.id);
    if (activeId.startsWith('item:')) {
      if (overId !== LIBRARY_ID) onPlace(activeId.slice(5), overId);
    } else {
      const entryId = activeId.slice(6);
      if (overId === LIBRARY_ID) onUnfile(entryId);
      else onMove(entryId, overId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="row" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Your folders</h3>
        <span className="spacer" />
        <button
          className="btn secondary sm"
          onClick={() => {
            const name = window.prompt('New folder name');
            if (name?.trim()) onCreateFolder(name.trim());
          }}
        >
          + New folder
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state">
          No folders yet. Folders are private to you — organise the shared library however you like.
        </div>
      ) : (
        folders.map((f) => (
          <FolderCard
            key={f.id}
            folder={f}
            items={grouped.get(f.id) ?? []}
            onFire={onFire}
            onRemoveItem={onUnfile}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
          />
        ))
      )}

      <LibraryDrawer
        kind={kind}
        tiles={tiles}
        onFire={onFire}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <DragOverlay>
        {dragging && (
          <div className="tile" style={{ width: 200, boxShadow: 'var(--shadow)' }}>
            <div className="tile-hero" style={{ height: 84 }}>
              <div className="tile-hero-fill" style={{ background: dragging.hero }} />
            </div>
            <div className="tile-body">
              <div className="tile-name">{dragging.name}</div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
