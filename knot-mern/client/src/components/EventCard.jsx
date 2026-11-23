import { Link } from 'react-router-dom';
import { Badge, StatusBadge } from './ui.jsx';
import { formatDistance, formatPrice, formatRange } from '../lib/format.js';
import { labelOf, EVENT_TYPES, MODES, INTERESTS } from '../lib/constants.js';

export function EventCard({ event }) {
  const distance = formatDistance(event.distanceKm);
  const full = event.registration.seatsLeft === 0;
  const placeLabel =
    event.mode === 'online' ? 'Online' : event.venue?.name || event.venue?.address || 'Location shared on the event page';
  let seatsLabel;
  if (event.registration.type === 'external') seatsLabel = 'Registers on organizer site';
  else if (event.registration.capacity === null) seatsLabel = 'Open seats';
  else if (full) seatsLabel = event.registration.waitlistEnabled ? 'Full · waitlist open' : 'Full';
  else seatsLabel = `${event.registration.seatsLeft} of ${event.registration.capacity} seats left`;

  return (
    <article className="event-card">
      <div className="event-card-top">
        <Badge tone="accent">{labelOf(EVENT_TYPES, event.eventType)}</Badge>
        <Badge>{labelOf(MODES, event.mode)}</Badge>
        {event.status !== 'published' && <StatusBadge status={event.status} />}
      </div>
      <h3 className="event-card-title">
        <Link to={`/events/${event.id}`}>{event.title}</Link>
      </h3>
      <p className="event-card-summary">{event.summary}</p>
      <dl className="event-meta">
        <div>
          <dt>When</dt>
          <dd>{formatRange(event.startAt, event.endAt)}</dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {placeLabel}
            {distance && <span className="muted"> · {distance}</span>}
          </dd>
        </div>
        <div>
          <dt>Entry</dt>
          <dd>{formatPrice(event.price)}</dd>
        </div>
        <div>
          <dt>Seats</dt>
          <dd>{seatsLabel}</dd>
        </div>
      </dl>
      <div className="chip-row">
        {event.interests.slice(0, 4).map((i) => (
          <span key={i} className="chip chip-static">
            {labelOf(INTERESTS, i)}
          </span>
        ))}
        {event.minAge > 0 && <span className="chip chip-static chip-warn">{event.minAge}+</span>}
      </div>
      {event.reasons?.length > 0 && (
        <ul className="reasons">
          {event.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
