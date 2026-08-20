import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, ApiError } from '../lib/api';
import type { Group, GroupId, GroupMember } from '../lib/types';

/**
 * Create, join, leave and delete groups.
 *
 * Every action here is an API call rather than a direct database write: the
 * password has to be checked where its hash lives, and creating a group means
 * writing the group, its secret and its owner membership together or not at
 * all.
 */
export function GroupManager({
  groups,
  activeGroupId,
  onChanged,
  onSwitch,
  onClose,
}: {
  groups: Group[];
  activeGroupId: GroupId;
  onChanged: () => Promise<void>;
  onSwitch: (id: GroupId) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});

  // Who is in each group, for the list below.
  useEffect(() => {
    void (async () => {
      const next: Record<string, GroupMember[]> = {};
      for (const g of groups) {
        try {
          next[g.id] = (await api.groupMembers(g.id)).members;
        } catch {
          next[g.id] = [];
        }
      }
      setMembers(next);
    })();
  }, [groups]);

  async function submit() {
    if (!name.trim()) return setError('Enter the group name.');
    if (!password) return setError('Enter the password.');
    if (mode === 'create' && password.length < 8) {
      return setError('Choose a password of at least 8 characters.');
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { group } =
        mode === 'create'
          ? await api.createGroup(name.trim(), password)
          : await api.joinGroup(name.trim(), password);

      setName('');
      setPassword('');
      await onChanged();
      onSwitch(group.id);
      setNotice(
        mode === 'create' ? `Created "${group.name}" and switched to it.` : `Joined "${group.name}".`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function leave(g: Group) {
    if (!window.confirm(`Leave "${g.name}"? You'd need the password to rejoin.`)) return;
    try {
      await api.leaveGroup(g.id);
      if (activeGroupId === g.id) onSwitch(null);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function destroy(g: Group) {
    const typed = window.prompt(
      `Deleting "${g.name}" permanently removes its scenes, effects, uploaded sounds and membership for everyone. This cannot be undone.\n\nType the group name to confirm:`,
    );
    if (typed?.trim().toLowerCase() !== g.name.toLowerCase()) {
      if (typed !== null) setError('Name did not match — nothing was deleted.');
      return;
    }

    try {
      await api.deleteGroup(g.id);
      if (activeGroupId === g.id) onSwitch(null);
      await onChanged();
      setNotice(`Deleted "${g.name}".`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function changePassword(g: Group) {
    const next = window.prompt(`New password for "${g.name}" (at least 8 characters):`);
    if (!next) return;
    try {
      await api.setGroupPassword(g.id, next);
      setNotice(`Password changed. Anyone joining "${g.name}" from now on needs the new one.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title="Groups" onClose={onClose}>
      <p className="hint">
        A group is a shared library and a live session. Everyone in it sees the same scenes and
        effects, and can fire them at each other — but only while both of you are signed in at the
        same time. Outside a group you still have a private library of your own.
      </p>

      {/* ---- join / create ---- */}
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className={mode === 'join' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('join');
              setError(null);
            }}
          >
            Join a group
          </button>
          <button
            className={mode === 'create' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('create');
              setError(null);
            }}
          >
            Create a group
          </button>
        </div>

        <div className="field">
          <label htmlFor="gname">Group name</label>
          <input
            id="gname"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thursday D&D"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="gpass">Password</label>
          <input
            id="gpass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            autoComplete="off"
            placeholder={mode === 'create' ? 'At least 8 characters' : ''}
          />
        </div>

        <p className="meta" style={{ marginBottom: 14 }}>
          {mode === 'create'
            ? 'You will own the group and be the only one who can delete it. Share the name and password with your friends so they can join.'
            : 'Both the name and the password must be right. Repeated wrong guesses are throttled.'}
        </p>

        <button className="btn block" onClick={submit} disabled={busy}>
          {busy ? 'Checking…' : mode === 'create' ? 'Create group' : 'Join group'}
        </button>

        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}
      </div>

      {/* ---- my groups ---- */}
      <div className="card">
        <h2>Your groups</h2>
        {groups.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            You're not in any groups yet. Everything you make right now is private to you, and
            stays that way — creating a group later won't move it.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="group-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="group-row-name">
                  {g.name}
                  {g.isOwner && <span className="pill" style={{ marginLeft: 8 }}>owner</span>}
                  {activeGroupId === g.id && (
                    <span className="pill" style={{ marginLeft: 6 }}>active</span>
                  )}
                </div>
                <div className="meta">
                  {(members[g.id] ?? []).map((m) => m.displayName).join(', ') || 'loading…'}
                </div>
              </div>

              <div className="row" style={{ gap: 6 }}>
                {g.isOwner ? (
                  <>
                    <button className="btn secondary sm" onClick={() => void changePassword(g)}>
                      Password
                    </button>
                    <button className="btn danger sm" onClick={() => void destroy(g)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button className="btn secondary sm" onClick={() => void leave(g)}>
                    Leave
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
