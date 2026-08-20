import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Email + password sign in.
 *
 * A note on who can get in: this form is only half the story. The real gate is
 * the "Allow new users to sign up" toggle in the Supabase dashboard. Once your
 * group has their accounts, turn it off — after that this signup form stops
 * working for everyone, including strangers who find the URL. A secret code
 * typed into a form here would be decorative, since anyone holding the public
 * anon key can call the signup endpoint directly.
 */
export function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Party of Effects</h1>
        <p className="hint">
          {mode === 'signin'
            ? 'Sign in to join the session.'
            : 'Create your account, then connect LIFX and Spotify.'}
        </p>

        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What the party sees"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </div>

        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}

        <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
          {mode === 'signin' ? 'Need an account? ' : 'Already have one? '}
          <button
            type="button"
            className="switch-link"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}
