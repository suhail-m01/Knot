import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox } from '../components/ui.jsx';
import { INTERESTS } from '../lib/constants.js';

const DEMO = [
  { label: 'Participant', email: 'participant@knot.local', password: 'Participant@123' },
  { label: 'Organizer', email: 'organizer@knot.local', password: 'Organizer@123' },
  { label: 'Admin', email: 'admin@knot.local', password: 'Admin@12345' },
];

function safeNext(raw) {
  // Only allow same-site relative paths to prevent open redirects.
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/plan';
}

export function LoginPage() {
  const { login, sessionNotice } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="card auth-card">
        <h1>Sign in to Knot</h1>
        <p className="muted">Your plan, passes, waitlists and notifications live behind sign-in. Browsing never does.</p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {sessionNotice && !error && <div className="alert">{sessionNotice}</div>}
          <ErrorBox error={error} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="small">
          New here? <Link to="/signup">Create an account</Link>
        </p>
        <p className="small muted" data-build="sign-in-fix-4">Preview build: sign-in-fix-4 (remove before launch)</p>
        <details className="demo">
          <summary>Demo accounts (seeded locally)</summary>
          <div className="btn-row">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="small muted">Fills the form only. Remove these buttons before a public launch.</p>
        </details>
      </section>
    </div>
  );
}

export function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', dateOfBirth: '', role: 'participant', interests: [] });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, dateOfBirth: form.dateOfBirth || null });
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="card auth-card">
        <h1>Join Knot</h1>
        <p className="muted">Participants register and plan. Organizers also publish events and check people in.</p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Full name</span>
            <input required minLength={2} maxLength={80} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="field">
            <span>Password (8+ characters)</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} />
          </label>
          <label className="field">
            <span>Date of birth (needed for age-restricted events)</span>
            <input type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ dateOfBirth: e.target.value })} />
          </label>
          <fieldset className="field">
            <legend>I want to</legend>
            <label className="check">
              <input type="radio" name="role" checked={form.role === 'participant'} onChange={() => set({ role: 'participant' })} />
              Join events
            </label>
            <label className="check">
              <input type="radio" name="role" checked={form.role === 'organizer'} onChange={() => set({ role: 'organizer' })} />
              Host events and check people in
            </label>
          </fieldset>
          <fieldset className="field">
            <legend>Interests (optional)</legend>
            <div className="chip-row">
              {INTERESTS.slice(0, 10).map(([v, label]) => {
                const on = form.interests.includes(v);
                return (
                  <button
                    type="button"
                    key={v}
                    className={`chip ${on ? 'chip-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set({ interests: on ? form.interests.filter((i) => i !== v) : [...form.interests, v] })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <ErrorBox error={error} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>
        <p className="small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
