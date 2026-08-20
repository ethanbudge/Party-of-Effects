import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Folder, FolderItem, Kind } from '../lib/types';

/** Minimal shape the board needs — scenes and effects both reduce to this. */
export interface BoardItem {
  id: string;
  name: string;
  /** Optional colour swatch (scenes show their hue; effects show their peak). */
  swatch?: string;
  subtitle?: string;
}

const LIBRARY_ID = '__library__';

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

function Chip({
  item,
  dragId,
  onFire,
  onRemove,
  onEdit,
}: {
  item: BoardItem;
  dragId: string;
  onFire: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });

  return (
    <div ref={setNodeRef} className={isDragging ? 'chip dragging' : 'chip'}>
      <span className="chip-grip" {...listeners} {...attributes} title="Drag into a folder">
        ⠿
      </span>
      {item.swatch && <span className="chip-swatch" style={{ background: item.swatch }} />}
      <span className="chip-name" title={item.subtitle ?? item.name}>
        {item.name}
      </span>
      <button className="chip-fire" onClick={onFire}>
        Go
      </button>
      {onEdit && (
        <button className="chip-x" onClick={onEdit} title="Edit">
          ✎
        </button>
      )}
      {onRemove && (
        <button className="chip-x" onClick={onRemove} title="Remove">
          ✕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

function FolderCard({
  folder,
  items,
  onFire,
  onRemoveItem,
  onRename,
  onDelete,
}: {
  folder: Folder;
  items: { entry: FolderItem; item: BoardItem }[];
  onFire: (item: BoardItem) => void;
  onRemoveItem: (entryId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: folder.id });

  return (
    <div ref={setNodeRef} className={isOver ? 'folder over' : 'folder'}>
      <div className="folder-head">
        <span className="folder-name">{folder.name}</span>
        <span className="folder-count">{items.length}</span>
        <button
          className="chip-x"
          title="Rename"
          onClick={() => {
            const name = window.prompt('Folder name', folder.name);
            if (name?.trim()) onRename(folder.id, name.trim());
          }}
        >
          ✎
        </button>
        <button
          className="chip-x"
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

      <div className="folder-items">
        {items.length === 0 ? (
          <div className="folder-empty">Drop here</div>
        ) : (
          items.map(({ entry, item }) => (
            <Chip
              key={entry.id}
              item={item}
              dragId={`entry:${entry.id}`}
              onFire={() => onFire(item)}
              onRemove={() => onRemoveItem(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library drawer
// ---------------------------------------------------------------------------

function LibraryDrawer({
  kind,
  items,
  onFire,
  onEdit,
  onDelete,
}: {
  kind: Kind;
  items: BoardItem[];
  onFire: (item: BoardItem) => void;
  onEdit: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id: LIBRARY_ID });

  return (
    <div ref={setNodeRef} className="drawer" style={isOver ? { borderColor: 'var(--accent)' } : {}}>
      <button className="drawer-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        All {kind === 'scene' ? 'scenes' : 'effects'}
        <span className="folder-count" style={{ marginLeft: 'auto' }}>
          {items.length}
        </span>
      </button>

      {open && (
        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              Nothing here yet — use the + button to create one.
            </div>
          ) : (
            items.map((item) => (
              <Chip
                key={item.id}
                item={item}
                dragId={`item:${item.id}`}
                onFire={() => onFire(item)}
                onEdit={() => onEdit(item)}
                onRemove={() => {
                  if (window.confirm(`Delete "${item.name}" for everyone?`)) onDelete(item);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function FolderBoard({
  kind,
  items,
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
  items: BoardItem[];
  folders: Folder[];
  folderItems: FolderItem[];
  onFire: (item: BoardItem) => void;
  onEdit: (item: BoardItem) => void;
  onDelete: (item: BoardItem) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onPlace: (itemId: string, folderId: string) => void;
  onMove: (entryId: string, folderId: string) => void;
  onUnfile: (entryId: string) => void;
}) {
  const [dragging, setDragging] = useState<BoardItem | null>(null);

  const sensors = useSensors(
    // A small activation distance keeps the "Go" button clickable — a click
    // shouldn't be swallowed by the drag handler.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, { entry: FolderItem; item: BoardItem }[]>();
    for (const f of folders) map.set(f.id, []);
    for (const entry of folderItems) {
      const item = byId.get(entry.item_id);
      if (item) map.get(entry.folder_id)?.push({ entry, item });
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
      // From the library into a folder.
      if (overId !== LIBRARY_ID) onPlace(activeId.slice(5), overId);
    } else {
      const entryId = activeId.slice(6);
      if (overId === LIBRARY_ID) onUnfile(entryId);
      else onMove(entryId, overId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="row" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Your folders</h3>
        <button
          className="btn secondary sm"
          onClick={() => {
            const name = window.prompt('New folder name');
            if (name?.trim()) onCreateFolder(name.trim());
          }}
        >
          + Folder
        </button>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state">
          No folders yet. Folders are private to you — organise the shared library however you like.
        </div>
      ) : (
        <div className="folder-grid">
          {folders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              items={grouped.get(f.id) ?? []}
              onFire={onFire}
              onRemoveItem={onUnfile}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            />
          ))}
        </div>
      )}

      <LibraryDrawer
        kind={kind}
        items={items}
        onFire={onFire}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <DragOverlay>
        {dragging && (
          <div className="chip">
            {dragging.swatch && (
              <span className="chip-swatch" style={{ background: dragging.swatch }} />
            )}
            <span className="chip-name">{dragging.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
