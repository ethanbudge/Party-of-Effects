import { useEffect, useRef, useState } from 'react';
import type { Group, GroupId } from '../lib/types';

/**
 * Which library you're looking at, in the top bar.
 *
 * Solo is always present and always first — it is the mode you get before
 * joining anything, and the one place to keep effects nobody else should see.
 */
export function GroupSwitcher({
  groups,
  activeGroupId,
  memberCount,
  onSwitch,
  onManage,
}: {
  groups: Group[];
  activeGroupId: GroupId;
  memberCount: number;
  onSwitch: (id: GroupId) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = groups.find((g) => g.id === activeGroupId) ?? null;

  return (
    <div className="group-switcher" ref={wrapRef}>
      <button className="group-button" onClick={() => setOpen(!open)}>
        <span className={active ? 'dot' : 'dot off'} />
        <span className="group-button-name">{active ? active.name : 'Solo'}</span>
        {active && <span className="group-button-count">{memberCount} here</span>}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="group-menu">
          <div className="group-menu-label">Switch library</div>

          <button
            className={`group-option${activeGroupId === null ? ' active' : ''}`}
            onClick={() => {
              onSwitch(null);
              setOpen(false);
            }}
          >
            <span className="dot off" />
            <span style={{ flex: 1 }}>
              Solo
              <br />
              <span className="meta">Private to you · no live session</span>
            </span>
            {activeGroupId === null && <span className="group-check">✓</span>}
          </button>

          {groups.map((g) => (
            <button
              key={g.id}
              className={`group-option${activeGroupId === g.id ? ' active' : ''}`}
              onClick={() => {
                onSwitch(g.id);
                setOpen(false);
              }}
            >
              <span className="dot" />
              <span style={{ flex: 1 }}>
                {g.name}
                <br />
                <span className="meta">{g.isOwner ? 'You created this group' : 'Member'}</span>
              </span>
              {activeGroupId === g.id && <span className="group-check">✓</span>}
            </button>
          ))}

          <div className="group-menu-foot">
            <button
              className="btn secondary sm block"
              onClick={() => {
                onManage();
                setOpen(false);
              }}
            >
              Create or join a group…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
