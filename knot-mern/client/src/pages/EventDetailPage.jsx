import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { Badge, EmptyState, ErrorBox, Spinner, StatusBadge, useToast } from '../components/ui.jsx';
import { EventMap } from '../components/EventMap.jsx';
import { PassCard } from '../components/PassCard.jsx';
import { formatDistance, formatPrice, formatRange } from '../lib/format.js';
import { EVENT_TYPES, INTERESTS, MODES, labelOf } from '../lib/constants.js';

export function EventDetailPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [liveSeats, setLiveSeats] = useState(null);
  const [actionError, setActionError] = useState(null);

  const detail = useQuery({
    queryKey: ['event', eventId, Boolean(user)],
    queryFn: () => api(`/api/events/${eventId}`),
    retry: (count, err) => err.status !== 404 && count < 2,
  });

  const event = detail.data?.event;
  const viewer = detail.data?.viewer;
  const seats = liveSeats && liveSeats.eventId === eventId ? liveSeats : event;

  // Live seat counts: watch this event's room and update without a page refresh.
  useEffect(() => {
    if (!eventId) return undefined;
    const socket = getSocket();
    const onSeats = (payload) => {
      if (payload.eventId === eventId) setLiveSeats(payload);
    };
    socket.emit('event:watch', eventId);
    socket.on('seats', onSeats);
    return () => {
      socket.emit('event:unwatch', eventId);
      socket.off('seats', onSeats);
    };
  }, [eventId]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    queryClient.invalidateQueries({ queryKey: ['plan'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
  };

  const cancel = useMutation({
    mutationFn: () => api(`/api/events/${eventId}/register`, { method: 'DELETE' }),
    onSuccess: () => {
      setActionError(null);
      toast('Your registration was cancelled.', 'info');
      refreshAll();
    },
    onError: (err) => setActionError(err),
  });

  const toggleSave = useMutation({
    mutationFn: (save) => api(`/api/events/${eventId}/save`, { method: save ? 'PUT' : 'DELETE' }),
    onSuccess: async (_d, save) => {
      toast(save ? 'Saved to your plan.' : 'Removed from your plan.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      await queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: (err) => setActionError(err),
  });

  const follow = useMutation({
    mutationFn: (follow) => api(`/api/users/following/${event.organizer.id}`, { method: follow ? 'PUT' : 'DELETE' }),
    onSuccess: (_d, follow) => {
      toast(follow ? `Following ${event.organizer.name}.` : 'Unfollowed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    },
    onError: (err) => setActionError(err),
  });

  const handoff = async () => {
    // Open the tab synchronously (before the await) so browsers do not block the popup.
    const tab = window.open('', '_blank', 'noopener');
    try {
      const { externalUrl } = await api(`/api/events/${eventId}/handoff`, { method: 'POST' });
      if (tab) tab.location.href = externalUrl;
      else window.location.href = externalUrl;
      toast('Opened the organizer’s site. Knot cannot see whether you finish registering there.', 'info');
    } catch (err) {
      tab?.close();
      setActionError(err);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copied.', 'success');
    } catch {
      toast('Copy the address from your browser bar.', 'info');
    }
  };

  if (detail.isLoading) return <Spinner label="Loading event…" />;
  if (detail.error?.status === 404) {
    return (
      <EmptyState title="This event is not available" action={<Link to="/discover" className="btn btn-ghost">Browse events</Link>}>
        It may have been removed, or it is still a draft.
      </EmptyState>
    );
  }
  if (detail.error) return <ErrorBox error={detail.error} />;

  const reg = viewer?.registration;
  const isNative = event.registration.type === 'native';
  const full = isNative && event.registration.capacity !== null && seats.seatsLeft === 0;
  const canWaitlist = full && event.registration.waitlistEnabled;
  const closed = event.status !== 'published' || new Date(event.startAt) <= new Date();
  const deadlinePassed = event.registrationDeadline && new Date(event.registrationDeadline) < new Date();
  const distance = formatDistance(event.distanceKm);
  const needsSignIn = !user;

  return (
    <article className="event-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/discover">Discover</Link> <span aria-hidden="true">/</span> <span>{event.title}</span>
      </nav>

      <header className="event-hero card">
        <div className="event-card-top">
          <Badge tone="accent">{labelOf(EVENT_TYPES, event.eventType)}</Badge>
          <Badge>{labelOf(MODES, event.mode)}</Badge>
          {event.status !== 'published' && <StatusBadge status={event.status} />}
          {event.minAge > 0 && <Badge tone="warn">{event.minAge}+ only</Badge>}
        </div>
        <h1>{event.title}</h1>
        <p className="lead">{event.summary}</p>
        <p className="muted">
          Hosted by{' '}
          <strong>{event.organizer.name}</strong>
          {user && user.id !== event.organizer.id && (
            <>
              {' · '}
              <button
                type="button"
                className="btn btn-link btn-sm"
                onClick={() => follow.mutate(!viewer?.followingOrganizer)}
                disabled={follow.isPending}
              >
                {viewer?.followingOrganizer ? 'Following ✓ (unfollow)' : 'Follow organizer'}
              </button>
            </>
          )}
        </p>
        {event.status === 'cancelled' && (
          <div className="alert alert-error">This event was cancelled{event.cancelledReason ? `: ${event.cancelledReason}` : '.'}</div>
        )}
        {event.status === 'ended' && <div className="alert">This event has ended. Thanks for being part of it.</div>}
      </header>

      <div className="event-layout">
        <div className="stack-lg">
          <section className="card">
            <h2>About this event</h2>
            <p className="prose">{event.description || 'The organizer has not added more details yet.'}</p>
            {event.interests.length > 0 && (
              <div className="chip-row">
                {event.interests.map((i) => (
                  <span key={i} className="chip chip-static">
                    {labelOf(INTERESTS, i)}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Where and when</h2>
            <dl className="facts">
              <div>
                <dt>When</dt>
                <dd>{formatRange(event.startAt, event.endAt)}</dd>
              </div>
              {event.registrationDeadline && (
                <div>
                  <dt>Registration closes</dt>
                  <dd>{formatRange(event.registrationDeadline)}</dd>
                </div>
              )}
              {event.venue && (
                <div>
                  <dt>Venue</dt>
                  <dd>
                    {event.venue.name || 'Venue to be confirmed'}
                    {event.venue.address && <div className="muted">{event.venue.address}</div>}
                    {distance && <div className="muted">{distance} from your search point</div>}
                  </dd>
                </div>
              )}
              {event.onlineUrl && (
                <div>
                  <dt>Join online</dt>
                  <dd>
                    {reg?.status === 'confirmed' || event.mode === 'online' ? (
                      <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer">
                        Open the join link
                      </a>
                    ) : (
                      <span className="muted">Shared with confirmed participants</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            {event.venue?.lat != null && (
              <EventMap items={[event]} center={{ lat: event.venue.lat, lng: event.venue.lng }} height={300} />
            )}
          </section>

          <section className="card">
            <h2>Eligibility and cost</h2>
            <p>
              <strong>Entry:</strong> {formatPrice(event.price)}
              {event.price.kind === 'paid' && <span className="muted"> (paid off-platform; Knot does not take payments)</span>}
            </p>
            <p>
              <strong>Age:</strong>{' '}
              {event.minAge > 0 ? `Participants aged ${event.minAge} or above. Your date of birth on your profile is checked.` : 'All ages.'}
            </p>
          </section>
        </div>

        <aside className="stack-lg sticky">
          <section className="card register-card" aria-live="polite">
            {event.registration.type === 'external' ? (
              <>
                <h3>Registers on the organizer’s site</h3>
                <p className="muted small">
                  This event is registered on another platform. Opening it is a handoff, not a Knot registration, and Knot
                  cannot confirm your seat.
                </p>
                <button type="button" className="btn btn-primary btn-block" onClick={handoff} disabled={closed}>
                  Continue to registration ↗
                </button>
              </>
            ) : (
              <>
                <div className="seat-meter">
                  <div className="seat-numbers">
                    <strong>{seats.registeredCount}</strong>
                    {event.registration.capacity !== null ? <span> / {event.registration.capacity} confirmed</span> : <span> confirmed · open seats</span>}
                  </div>
                  {event.registration.capacity !== null && (
                    <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={event.registration.capacity} aria-valuenow={seats.registeredCount}>
                      <span style={{ width: `${Math.min(100, (seats.registeredCount / event.registration.capacity) * 100)}%` }} />
                    </div>
                  )}
                  {seats.waitlistCount > 0 && <p className="small muted">{seats.waitlistCount} on the waitlist</p>}
                  <p className="small muted" aria-live="polite">Seats update live.</p>
                </div>

                {reg && reg.status === 'confirmed' && (
                  <>
                    <p className="ok-line">✓ You are registered.</p>
                    <PassCard registration={reg} title={event.title} />
                    {!reg.checkedInAt && !closed && (
                      <button type="button" className="btn btn-ghost btn-block" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                        Cancel my registration
                      </button>
                    )}
                  </>
                )}
                {reg && reg.status === 'waitlisted' && (
                  <>
                    <p className="warn-line">You are on the waitlist. We will tell you if a seat opens.</p>
                    <button type="button" className="btn btn-ghost btn-block" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                      Leave waitlist
                    </button>
                  </>
                )}
                {!reg && (
                  <>
                    {needsSignIn ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={() => navigate(`/login?next=${encodeURIComponent(`/events/${eventId}/register`)}`)}
                      >
                        Sign in to register
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={() => navigate(`/events/${eventId}/register`)}
                        disabled={closed || deadlinePassed || (full && !canWaitlist)}
                      >
                        {full && canWaitlist ? 'Join the waitlist' : 'Register'}
                      </button>
                    )}
                    {!needsSignIn && <p className="small muted">Registration takes about a minute: your details, your team if the event needs one, then the organiser’s questions.</p>}
                    {closed && <p className="muted small">Registration is closed for this event.</p>}
                    {!closed && deadlinePassed && <p className="muted small">The registration deadline has passed.</p>}
                    {full && !canWaitlist && <p className="muted small">This event is full.</p>}
                  </>
                )}
                <ErrorBox error={actionError} />
              </>
            )}

            <div className="btn-row">
              {user && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleSave.mutate(!viewer?.saved)} disabled={toggleSave.isPending}>
                  {viewer?.saved ? '★ Saved' : '☆ Save'}
                </button>
              )}
              <a className="btn btn-ghost btn-sm" href={`/api/events/${eventId}/ics`} download>
                Add to calendar
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
                Copy link
              </button>
            </div>
            {event.registration.type === 'native' && <p className="small muted">Registration is free. Your details are shown only to the organizer.</p>}
          </section>

          {(user?.role === 'organizer' || user?.role === 'admin') && user.id === event.organizer.id && (
            <Link to={`/organizer/events/${event.id}`} className="btn btn-ghost btn-block">
              Manage this event
            </Link>
          )}
        </aside>
      </div>
    </article>
  );
}
