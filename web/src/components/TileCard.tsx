import { useDraggable } from '@dnd-kit/core';

export interface TileData {
  id: string;
  name: string;
  /** CSS background for the hero area — a gradient. */
  hero: string;
  /** Line under the name. */
  meta: string;
  /** Fractional positions (0–1) of keyframes, drawn as ticks. Effects only. */
  ticks?: number[];
}

/**
 * A scene or effect as a gradient hero card.
 *
 * The hero is the drag handle rather than a separate grip: the whole coloured
 * area is the thing you grab, which is both a bigger target and more obvious.
 * The buttons below stop propagation so clicking Play never starts a drag.
 */
export function TileCard({
  tile,
  dragId,
  onFire,
  onEdit,
  onRemove,
  removeTitle,
}: {
  tile: TileData;
  dragId: string;
  onFire: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  removeTitle?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });

  return (
    <div className={`tile${isDragging ? ' dragging' : ''}`}>
      <div
        ref={setNodeRef}
        className="tile-hero"
        title={`${tile.name} — drag into a folder`}
        {...listeners}
        {...attributes}
      >
        <div className="tile-hero-fill" style={{ background: tile.hero }} />
        {tile.ticks && tile.ticks.length > 0 && (
          <div className="tile-ticks">
            {tile.ticks.map((t, i) => (
              <span key={i} className="tile-tick" style={{ left: `${t * 100}%` }} />
            ))}
          </div>
        )}
      </div>

      <div className="tile-body">
        <div className="tile-name" title={tile.name}>
          {tile.name}
        </div>
        <div className="tile-foot">
          <span className="tile-meta">{tile.meta}</span>

          <div className="tile-actions">
            {onEdit && (
              <button
                className="icon-btn"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                ✎
              </button>
            )}
            {onRemove && (
              <button
                className="icon-btn danger"
                title={removeTitle ?? 'Remove'}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                ✕
              </button>
            )}
          </div>

          <button
            className="tile-play"
            title="Fire for everyone"
            onClick={(e) => {
              e.stopPropagation();
              onFire();
            }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
