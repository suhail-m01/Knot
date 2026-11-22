import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { PassCard } from '../components/PassCard.jsx';
import { EmptyState, ErrorBox, Spinner, StatusBadge, useToast } from '../components/ui.jsx';
import { formatDateTime, formatDay, formatRange } from '../lib/format.js';

export function PlanPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => api('/api/users/me/plan') });

  const unsave = useMutation({
    mutationFn: (id) => api(`/api/events/${id}/save`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Removed from your plan.', 'info');
      queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });

  if (plan.isLoading) return <Spinner label="Building your plan…" />;
  if (plan.error) return <ErrorBox error={plan.error} />;

  const { registrations, saved, conflicts, deadlines } = plan.data;
  const confirmedCount = registrations.filter((r) => r.registration.status === 'confirmed').length;
  const empty = registrations.length === 0 && saved.length === 0;

  return (
    <div className="stack-xl">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your plan</p>
          <h1>Upcoming and saved</h1>
          <p className="muted">
            {confirmedCount} confirmed · {registrations.length - confirmedCount} on waitlists · {saved.length} saved
          </p>
        </div>
        <Link to="/discover" className="btn btn-primary">
          Find more events
        </Link>
      </header>

      {conflicts.length > 0 && (
        <section className="alert alert-warn" role="alert">
          <strong>Schedule clash{conflicts.length > 1 ? 'es' : ''}:</strong>
          <ul>
            {conflicts.map((c) => (
              <li key={`${c.first.id}-${c.second.id}`}>
                <em>{c.first.title}</em> and <em>{c.second.title}</em> overlap by {c.overlapMinutes} minutes.
              </li>
            ))}
          </ul>
        </section>
      )}

      {deadlines.length > 0 && (
        <section className="card">
          <h2>Deadlines</h2>
          <ul className="list">
            {deadlines.map((d) => (
              <li key={d.eventId}>
                <Link to={`/events/${d.eventId}`}>{d.title}</Link> — registration closes {formatDateTime(d.deadline)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <EmptyState title="Nothing planned yet" action={<Link to="/discover" className="btn btn-primary">Browse events</Link>}>
          Register for an event or save one to see it here.
        </EmptyState>
      )}

      {registrations.length > 0 && (
        <section>
          <h2>Registrations</h2>
          <div className="plan-list">
            {registrations.map(({ registration, event }) => (
              <article key={registration.id} className="plan-item card">
                <div className="plan-meta">
                  <div className="plan-date">
                    <span>{formatDay(event.startAt)}</span>
                  </div>
                  <div>
                    <h3>
                      <Link to={`/events/${event.id}`}>{event.title}</Link>
                    </h3>
                    <p className="muted small">
                      {formatRange(event.startAt, event.endAt)} · {event.venue?.name || (event.mode === 'online' ? 'Online' : 'Venue shared soon')}
                    </p>
                    <p>
                      <StatusBadge status={registration.status} />
                      {event.status === 'cancelled' && <span className="badge badge-bad">Event cancelled</span>}
                    </p>
                    <div className="btn-row">
                      <a className="btn btn-ghost btn-sm" href={`/api/events/${event.id}/ics`} download>
                        Add to calendar
                      </a>
                      <Link className="btn btn-ghost btn-sm" to={`/events/${event.id}`}>
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
                {registration.status === 'confirmed' && event.status === 'published' && (
                  <PassCard registration={registration} title={event.title} />
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section>
          <h2>Saved</h2>
          <ul className="list card">
            {saved.map((e) => (
              <li key={e.id} className="saved-row">
                <div>
                  <Link to={`/events/${e.id}`}>{e.title}</Link>
                  <div className="muted small">{formatRange(e.startAt, e.endAt)}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => unsave.mutate(e.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
