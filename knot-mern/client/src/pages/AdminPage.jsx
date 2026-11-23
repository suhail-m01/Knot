import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ErrorBox, Spinner, Stat, StatusBadge, useToast } from '../components/ui.jsx';
import { ROLE_LABELS } from '../lib/constants.js';
import { formatRange } from '../lib/format.js';

export function AdminPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api('/api/admin/stats') });
  const users = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => api(`/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });
  const events = useQuery({ queryKey: ['admin', 'events'], queryFn: () => api('/api/admin/events') });

  const setRole = useMutation({
    mutationFn: ({ id, role }) => api(`/api/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: () => {
      toast('Role updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: setError,
  });

  const takedown = useMutation({
    mutationFn: (id) => api(`/api/admin/events/${id}/takedown`, { method: 'POST', body: { reason: 'Removed after moderation review' } }),
    onSuccess: () => {
      toast('Event removed. Registered people were notified.', 'info');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: setError,
  });

  if (stats.isLoading) return <Spinner />;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const s = stats.data.stats;

  return (
    <div className="stack-xl">
      <header className="page-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Platform console</h1>
          <p className="muted">Roles, moderation and platform totals. Actions are limited to admins.</p>
        </div>
      </header>

      <ErrorBox error={error} />

      <section className="stats">
        <Stat label="Accounts" value={s.users} hint={`${s.usersByRole.participant ?? 0} participants · ${s.usersByRole.organizer ?? 0} organizers`} />
        <Stat label="Published events" value={s.eventsByStatus.published ?? 0} hint={`${s.eventsByStatus.ended ?? 0} ended · ${s.eventsByStatus.cancelled ?? 0} cancelled`} />
        <Stat label="Confirmed seats" value={s.confirmedRegistrations} />
        <Stat label="Checked in" value={s.checkedIn} />
      </section>

      <section>
        <div className="section-head">
          <h2>Users</h2>
          <input type="search" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        {users.isLoading && <Spinner />}
        {users.data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="small">{u.email}</td>
                    <td>
                      <select value={u.role} aria-label={`Role for ${u.name}`} onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value })}>
                        {Object.entries(ROLE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Events</h2>
        {events.isLoading && <Spinner />}
        {events.data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Seats</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/events/${e.id}`}>{e.title}</Link>
                    </td>
                    <td className="small">{formatRange(e.startAt, e.endAt)}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td>{e.registeredCount}</td>
                    <td className="actions">
                      {e.status === 'published' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            if (window.confirm('Remove this event for moderation? Registered people will be notified.')) takedown.mutate(e.id);
                          }}
                        >
                          Take down
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
