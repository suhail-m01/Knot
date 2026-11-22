import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadFile } from '../lib/api.js';
import { EventForm, formFromEvent } from '../components/EventForm.jsx';
import { Badge, EmptyState, ErrorBox, Spinner, Stat, StatusBadge, useToast } from '../components/ui.jsx';
import { formatDateTime, formatRange } from '../lib/format.js';
import { EVENT_TYPES, labelOf } from '../lib/constants.js';
import { QrScannerPanel } from '../components/QrScannerPanel.jsx';

// ---------- Dashboard ----------
export function OrganizerDashboardPage() {
  const stats = useQuery({ queryKey: ['organizer', 'stats'], queryFn: () => api('/api/organizer/stats') });
  const events = useQuery({ queryKey: ['organizer', 'events'], queryFn: () => api('/api/organizer/events') });
  const s = stats.data?.stats;

  return (
    <div className="stack-xl">
      <header className="page-head">
        <div>
          <p className="eyebrow">Organizer</p>
          <h1>Your events</h1>
          <p className="muted">Publish, edit, check people in and message attendees.</p>
        </div>
        <Link to="/organizer/events/new" className="btn btn-primary">
          New event
        </Link>
      </header>

      {stats.error && <ErrorBox error={stats.error} />}
      {s && (
        <section className="stats">
          <Stat label="Upcoming published" value={s.upcoming} />
          <Stat label="Confirmed registrations" value={s.registrations} hint={`${s.waitlisted} waitlisted`} />
          <Stat label="Checked in" value={s.checkedIn} hint={s.checkInRate !== null ? `${s.checkInRate}% of confirmed` : 'No registrations yet'} />
          <Stat label="Outbound handoffs" value={s.externalHandoffs} hint="Clicks to external sites, not registrations" />
        </section>
      )}

      {events.isLoading && <Spinner />}
      {events.data && events.data.items.length === 0 && (
        <EmptyState title="No events yet" action={<Link className="btn btn-primary" to="/organizer/events/new">Create your first event</Link>}>
          Start with a title, a time and a locality. You can add details later.
        </EmptyState>
      )}

      {events.data?.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>When</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Waitlist</th>
                <th>Checked in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {events.data.items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.title}</strong>
                    <div className="muted small">{labelOf(EVENT_TYPES, e.eventType)}</div>
                  </td>
                  <td className="small">{formatRange(e.startAt, e.endAt)}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>
                    {e.registeredCount}
                    {e.registration.capacity !== null && <span className="muted"> / {e.registration.capacity}</span>}
                  </td>
                  <td>{e.waitlistCount}</td>
                  <td>{e.checkedInCount}</td>
                  <td className="actions">
                    <Link to={`/organizer/events/${e.id}`}>Manage</Link>
                    <Link to={`/organizer/events/${e.id}/edit`}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Create / edit ----------
export function OrganizerEventFormPage() {
  const { eventId } = useParams();
  const editing = Boolean(eventId);
  const navigate = useNavigate();
  const location = useLocation();
  // Instant Add passes a reviewed draft through router state; it is never saved until the form is submitted.
  const prefill = location.state?.prefill ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState(null);

  const localities = useQuery({ queryKey: ['localities'], queryFn: () => api('/api/localities'), staleTime: Infinity });
  const existing = useQuery({
    queryKey: ['event', eventId, true],
    queryFn: () => api(`/api/events/${eventId}`),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: (payload) =>
      editing
        ? api(`/api/events/${eventId}`, { method: 'PATCH', body: payload })
        : api('/api/events', { method: 'POST', body: payload }),
    onSuccess: ({ event }) => {
      setError(null);
      toast(editing ? 'Event updated.' : 'Event created.', 'success');
      queryClient.invalidateQueries({ queryKey: ['organizer'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      navigate(`/organizer/events/${event.id}`);
    },
    onError: setError,
  });

  if (localities.isLoading || (editing && existing.isLoading)) return <Spinner />;
  if (existing.error) return <ErrorBox error={existing.error} />;

  const initial = existing.data?.event ? formFromEvent(existing.data.event) : prefill;
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">{editing ? 'Edit event' : 'New event'}</p>
          <h1>{editing ? existing.data.event.title : 'Publish an event'}</h1>
          <p className="muted">
            Material changes to time or venue notify people who have registered. Times are IST.
          </p>
        </div>
      </header>
      <ErrorBox error={error} />
      <EventForm
        key={eventId ?? 'new'}
        initial={initial}
        localities={localities.data?.items ?? []}
        onSubmit={(payload) => save.mutate(payload)}
        submitting={save.isPending}
        submitLabel={editing ? 'Save changes' : 'Publish event'}
      />
    </div>
  );
}

// ---------- Manage one event ----------
export function OrganizerManagePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [passToken, setPassToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [lastCheckIn, setLastCheckIn] = useState(null);

  const attendees = useQuery({
    queryKey: ['organizer', 'attendees', eventId],
    queryFn: () => api(`/api/organizer/events/${eventId}/attendees`),
    refetchInterval: 15000,
  });
  const announcements = useQuery({
    queryKey: ['organizer', 'announcements', eventId],
    queryFn: () => api(`/api/organizer/events/${eventId}/announcements`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['organizer'] });
    queryClient.invalidateQueries({ queryKey: ['event', eventId] });
  };

  const checkIn = useMutation({
    mutationFn: (token) => api(`/api/organizer/events/${eventId}/checkin`, { method: 'POST', body: { passToken: token } }),
    onSuccess: ({ attendee }) => {
      setError(null);
      setLastCheckIn({ ok: true, text: `${attendee.name} checked in.` });
      setPassToken('');
      refresh();
    },
    onError: (err) => {
      setLastCheckIn({ ok: false, text: err.message });
      setError(null);
    },
  });

  const announce = useMutation({
    mutationFn: () => api(`/api/organizer/events/${eventId}/announcements`, { method: 'POST', body: { message } }),
    onSuccess: ({ announcement }) => {
      toast(`Sent to ${announcement.recipients} attendee${announcement.recipients === 1 ? '' : 's'}.`, 'success');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['organizer', 'announcements', eventId] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: setError,
  });

  const cancel = useMutation({
    mutationFn: () => api(`/api/events/${eventId}/cancel`, { method: 'POST', body: { reason: 'Cancelled by the organizer' } }),
    onSuccess: () => {
      toast('Event cancelled. Attendees have been notified.', 'info');
      refresh();
    },
    onError: setError,
  });

  if (attendees.isLoading) return <Spinner />;
  if (attendees.error) return <ErrorBox error={attendees.error} />;
  const { event, attendees: rows } = attendees.data;
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const waitlisted = rows.filter((r) => r.status === 'waitlisted');
  const cancelled = rows.filter((r) => r.status === 'cancelled');

  const submitCheckIn = (e) => {
    e.preventDefault();
    // Accept a pasted code or a scanned value with a prefix, and strip whitespace.
    const token = passToken.trim().replace(/^knot[-:](?:checkin:v1[-:]|pass[-:])/i, '');
    if (token) checkIn.mutate(token);
  };

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">Manage event</p>
          <h1>{event.title}</h1>
          <p className="muted">
            <StatusBadge status={event.status} /> · {formatRange(event.startAt, event.endAt)}
          </p>
        </div>
        <div className="btn-row">
          <Link to={`/events/${event.id}`} className="btn btn-ghost">
            View public page
          </Link>
          <Link to={`/organizer/events/${event.id}/edit`} className="btn btn-ghost">
            Edit
          </Link>
          <button
            type="button"
            className="btn btn-danger"
            disabled={cancel.isPending || event.status === 'cancelled' || event.status === 'ended'}
            onClick={() => {
              if (window.confirm('Cancel this event? Everyone registered will be notified.')) cancel.mutate();
            }}
          >
            Cancel event
          </button>
        </div>
      </header>

      <ErrorBox error={error} />

      <section className="stats">
        <Stat label="Confirmed" value={event.registeredCount} hint={event.registration.capacity !== null ? `of ${event.registration.capacity}` : 'unlimited'} />
        <Stat label="Waitlist" value={event.waitlistCount} />
        <Stat label="Checked in" value={event.checkedInCount} hint={event.registeredCount ? `${Math.round((event.checkedInCount / event.registeredCount) * 100)}%` : ''} />
        <Stat label="Handoffs" value={event.externalHandoffs} hint={event.registration.type === 'external' ? 'External site clicks' : 'Not used for native events'} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Check people in</h2>
          <p className="muted small">
            Ask participants to open their plan and show the QR pass. Scan it with a QR app and paste the code here, or type it.
          </p>
          <div className="stack">
            <QrScannerPanel onDecode={(text) => checkIn.mutate(text.trim().replace(/^knot[-:](?:checkin:v1[-:]|pass[-:])/i, ''))} disabled={checkIn.isPending} />
          </div>
          <form className="row" onSubmit={submitCheckIn}>
            <input
              aria-label="Pass code"
              placeholder="Pass code"
              value={passToken}
              onChange={(e) => setPassToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary" disabled={checkIn.isPending || !passToken.trim()}>
              Check in
            </button>
          </form>
          {lastCheckIn && (
            <p className={lastCheckIn.ok ? 'ok-line' : 'alert alert-error'} role="status">
              {lastCheckIn.text}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Message attendees</h2>
          <p className="muted small">Sends an in-app notification to everyone confirmed or waitlisted. Knot does not send email.</p>
          <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Doors open 15 minutes early. Bring your QR pass." />
          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={announce.isPending || message.trim().length < 3} onClick={() => announce.mutate()}>
              Send update
            </button>
          </div>
          {announcements.data?.items?.length > 0 && (
            <ul className="list small">
              {announcements.data.items.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <span className="muted">{formatDateTime(a.createdAt)} · {a.recipients} recipients</span>
                  <div>{a.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="section-head">
          <h2>Attendees</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadFile(`/api/organizer/events/${event.id}/attendees.csv`, `knot-attendees-${event.id}.csv`).catch((e) => setError(e))}
          >
            Download CSV
          </button>
        </div>
        {rows.length === 0 && <EmptyState title="No registrations yet">Share the event page to start filling seats.</EmptyState>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Checked in</th>
                </tr>
              </thead>
              <tbody>
                {[...confirmed, ...waitlisted, ...cancelled].map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="small">{r.email}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="small">{r.queuedAt ? formatDateTime(r.queuedAt) : '—'}</td>
                    <td className="small">{r.checkedInAt ? <Badge tone="good">{formatDateTime(r.checkedInAt)}</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          {confirmed.length} confirmed · {waitlisted.length} waitlisted · {cancelled.length} cancelled.{' '}
          <button type="button" className="btn btn-link btn-sm" onClick={() => navigate(-1)}>
            Back
          </button>
        </p>
      </section>
    </div>
  );
}
