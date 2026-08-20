import { useState, type KeyboardEvent } from 'react';
import { normalise } from '../lib/voice';

/**
 * Trigger phrase editor: type a phrase, press Enter, get a chip.
 *
 * Phrases are stored as typed but matched after normalising (lowercased,
 * accents folded), so "Décharge" and "decharge" are the same trigger. The chip
 * shows the normalised form when it differs, so it's clear what is actually
 * being listened for.
 */
export function TriggerWords({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const phrase = draft.trim();
    if (!phrase) return;
    // Compare normalised so "Fireball" and "fireball" don't both get stored.
    const key = normalise(phrase);
    if (!key) return;
    if (value.some((v) => normalise(v) === key)) {
      setDraft('');
      return;
    }
    onChange([...value, phrase]);
    setDraft('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="chip-input">
        {value.map((phrase) => {
          const norm = normalise(phrase);
          return (
            <span key={phrase} className="trigger-chip" title={`Listens for: ${norm}`}>
              {phrase}
              {norm !== phrase.toLowerCase() && <em className="trigger-norm">{norm}</em>}
              <button
                type="button"
                className="icon-btn"
                onClick={() => onChange(value.filter((v) => v !== phrase))}
                aria-label={`Remove ${phrase}`}
              >
                ✕
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={value.length ? 'Add another…' : 'e.g. boule de feu'}
          className="chip-input-field"
        />
      </div>
      <p className="meta" style={{ marginTop: 6 }}>
        Enter to add. Multi-word phrases are fine and match more reliably than single short words.
      </p>
    </div>
  );
}
