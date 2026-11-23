import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { ErrorBox, useToast } from '../components/ui.jsx';
import { INTERESTS, ROLE_LABELS, labelOf } from '../lib/constants.js';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const localities = useQuery({ queryKey: ['localities'], queryFn: () => api('/api/localities'), staleTime: Infinity });
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        dateOfBirth: user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
        localityId: user.localityId ?? '',
        interests: user.interests ?? [],
      });
    }
  }, [user]);

  const save = useMutation({
    mutationFn: (body) => api('/api/users/me', { method: 'PATCH', body }),
    onSuccess: ({ user: updated }) => {
      setUser(updated);
      setError(null);
      toast('Profile saved.', 'success');
    },
    onError: setError,
  });

  if (!user || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    save.mutate({
      name: form.name.trim(),
      dateOfBirth: form.dateOfBirth || null,
      localityId: form.localityId || null,
      interests: form.interests,
    });
  };

  return (
    <div className="narrow stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your profile</p>
          <h1>{user.name}</h1>
          <p className="muted">
            {user.email} · {ROLE_LABELS[user.role]}
          </p>
        </div>
      </header>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input required minLength={2} maxLength={80} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="row">
          <label className="field">
            <span>Date of birth</span>
            <input type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ dateOfBirth: e.target.value })} />
            <small className="muted">Used only to check age limits. Organizers never see it.</small>
          </label>
          <label className="field">
            <span>Home locality</span>
            <select value={form.localityId} onChange={(e) => set({ localityId: e.target.value })}>
              <option value="">Not set</option>
              {(localities.data?.items ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="field">
          <legend>Interests (used for recommendations)</legend>
          <div className="chip-row">
            {INTERESTS.map(([v, label]) => {
              const on = form.interests.includes(v);
              return (
                <button
                  type="button"
                  key={v}
                  className={`chip ${on ? 'chip-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => set({ interests: on ? form.interests.filter((i) => i !== v) : [...form.interests, v].slice(0, 10) })}
                >
                  {labelOf(INTERESTS, v)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <ErrorBox error={error} />
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          Knot stores your name, email, date of birth (optional), interests and registrations to run the service. Passwords
          are stored only as bcrypt hashes. Organizers see your name and email only for events you register for.
        </p>
      </section>
    </div>
  );
}
