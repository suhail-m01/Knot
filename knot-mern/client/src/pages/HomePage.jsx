import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api, qs } from '../lib/api.js';
import { EventCard } from '../components/EventCard.jsx';
import { EmptyState, Spinner } from '../components/ui.jsx';
import { INTERESTS } from '../lib/constants.js';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const upcoming = useQuery({
    queryKey: ['events', 'home'],
    queryFn: () => api(`/api/events${qs({ limit: 6, sort: 'date' })}`),
  });
  const recommended = useQuery({
    queryKey: ['events', 'recommended'],
    queryFn: () => api('/api/events/recommended'),
    enabled: Boolean(user),
  });
  const localities = useQuery({
    queryKey: ['localities'],
    queryFn: () => api('/api/localities'),
    staleTime: Infinity,
  });

  const submit = (e) => {
    e.preventDefault();
    navigate(`/discover${qs({ q: q.trim() })}`);
  };

  return (
    <div className="stack-xl">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hyperlocal events · Bengaluru first</p>
          <h1>Find the events that fit your neighbourhood, interests and schedule.</h1>
          <p className="lead">
            Knot shows what is near you, tells you honestly whether a seat is free, and keeps your plan in one place.
            Waitlists move automatically, and every pass is a private QR code.
          </p>
          <form className="hero-search" onSubmit={submit} role="search">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try “robotics”, “hackathon” or “Indiranagar”"
              aria-label="Search events"
            />
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>
          <div className="chip-row">
            {(localities.data?.items ?? []).slice(0, 8).map((l) => (
              <Link key={l.id} to={`/discover?locality=${l.id}`} className="chip">
                {l.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-panel" aria-label="Interests">
          <h2>Browse by interest</h2>
          <div className="chip-row">
            {INTERESTS.map(([v, label]) => (
              <Link key={v} to={`/discover?interest=${v}`} className="chip">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {user && (
        <section>
          <div className="section-head">
            <h2>Recommended for you</h2>
            <Link to="/profile" className="btn btn-link btn-sm">
              Tune your interests
            </Link>
          </div>
          {recommended.isLoading && <Spinner />}
          {recommended.data?.items?.length ? (
            <div className="grid-cards">
              {recommended.data.items.slice(0, 3).map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            recommended.isSuccess && (
              <EmptyState title="No picks yet">Add interests and your locality on your profile to get explainable recommendations.</EmptyState>
            )
          )}
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Coming up</h2>
          <Link to="/discover" className="btn btn-link btn-sm">
            See everything →
          </Link>
        </div>
        {upcoming.isLoading && <Spinner />}
        {upcoming.isError && <EmptyState title="Could not load events">{upcoming.error.message}</EmptyState>}
        {upcoming.data && upcoming.data.items.length === 0 && (
          <EmptyState title="Nothing scheduled yet">Organizers can publish events from the Organizer area.</EmptyState>
        )}
        <div className="grid-cards">
          {upcoming.data?.items.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      </section>

      <section className="how">
        <div className="card">
          <h3>Honest seats</h3>
          <p className="muted">Live counts update on the event page. A full event either takes a waitlist or says it is full.</p>
        </div>
        <div className="card">
          <h3>Clear handoffs</h3>
          <p className="muted">If an organizer registers people elsewhere, Knot says so. Visiting that site is not counted as a registration.</p>
        </div>
        <div className="card">
          <h3>Plans without clashes</h3>
          <p className="muted">Your plan flags overlapping sessions, deadlines and saved events, and exports to any calendar app.</p>
        </div>
      </section>
    </div>
  );
}
