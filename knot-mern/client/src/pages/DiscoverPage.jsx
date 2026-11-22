import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, qs } from '../lib/api.js';
import { Filters } from '../components/Filters.jsx';
import { EventCard } from '../components/EventCard.jsx';
import { EventMap } from '../components/EventMap.jsx';
import { EmptyState, ErrorBox, Spinner } from '../components/ui.jsx';
import { DEFAULT_CENTER } from '../lib/constants.js';

const FILTER_KEYS = ['q', 'locality', 'type', 'mode', 'interest', 'price', 'from', 'to', 'lat', 'lng', 'radiusKm', 'sort'];

function readFilters(params) {
  return {
    q: params.get('q') || '',
    locality: params.get('locality') || '',
    type: params.get('type') || '',
    mode: params.get('mode') || '',
    interest: params.get('interest') || '',
    price: params.get('price') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    lat: params.get('lat') || '',
    lng: params.get('lng') || '',
    radiusKm: params.get('radiusKm') || '10',
    sort: params.get('sort') || 'date',
  };
}

export function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('list');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const filters = useMemo(() => readFilters(params), [params]);

  const localities = useQuery({ queryKey: ['localities'], queryFn: () => api('/api/localities'), staleTime: Infinity });
  const localityList = localities.data?.items ?? [];

  const apiParams = useMemo(() => {
    const p = { ...filters };
    if (p.sort === 'distance' && !p.lat) p.sort = 'date';
    if (!p.lat) delete p.radiusKm;
    return p;
  }, [filters]);

  const listing = useInfiniteQuery({
    queryKey: ['events', 'discover', apiParams],
    queryFn: ({ pageParam }) => api(`/api/events${qs({ ...apiParams, page: pageParam, limit: 12 })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items = listing.data?.pages.flatMap((p) => p.items) ?? [];
  const total = listing.data?.pages[0]?.total ?? 0;
  const searchCentre = filters.lat && filters.lng ? { lat: Number(filters.lat), lng: Number(filters.lng) } : null;
  const mapCentre = searchCentre ?? DEFAULT_CENTER;

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === undefined || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    // Choosing a locality also centres the radius search on it.
    if ('locality' in patch) {
      const loc = localityList.find((l) => l.id === patch.locality);
      if (loc) {
        next.set('lat', String(loc.lat));
        next.set('lng', String(loc.lng));
        if (!next.get('radiusKm')) next.set('radiusKm', '10');
      } else {
        next.delete('lat');
        next.delete('lng');
      }
    }
    if ('lat' in patch && patch.lat === '') {
      next.delete('lng');
      next.delete('lat');
    }
    setParams(next, { replace: true });
  };

  const useLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Your browser does not share location. Choose a locality instead.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = new URLSearchParams(params);
        next.set('lat', pos.coords.latitude.toFixed(5));
        next.set('lng', pos.coords.longitude.toFixed(5));
        next.set('sort', 'distance');
        next.delete('locality');
        if (!next.get('radiusKm')) next.set('radiusKm', '10');
        setParams(next, { replace: true });
      },
      () => {
        setLocating(false);
        setGeoError('Location permission was not granted. You can still pick a locality.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  };

  const clear = () => setParams(new URLSearchParams(), { replace: true });
  const hasAnyFilter = FILTER_KEYS.some((k) => params.get(k) && !(k === 'sort' && params.get(k) === 'date'));

  return (
    <div className="discover">
      <Filters
        values={filters}
        onChange={update}
        localities={localityList}
        onUseLocation={useLocation}
        locating={locating}
        onClear={clear}
      />

      <section className="results" aria-live="polite">
        <div className="results-head">
          <div>
            <h1>Events</h1>
            <p className="muted">
              {listing.isSuccess ? `${total} ${total === 1 ? 'event' : 'events'} found` : 'Searching…'}
              {searchCentre && ` · within ${filters.radiusKm} km of ${filters.locality ? localityList.find((l) => l.id === filters.locality)?.name : 'your location'}`}
              {hasAnyFilter ? '' : ' · upcoming across Bengaluru'}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="View">
            <button type="button" className={view === 'list' ? 'seg seg-on' : 'seg'} onClick={() => setView('list')}>
              List
            </button>
            <button type="button" className={view === 'map' ? 'seg seg-on' : 'seg'} onClick={() => setView('map')}>
              Map
            </button>
          </div>
        </div>

        {geoError && <ErrorBox error={{ message: geoError }} />}
        {listing.isError && <ErrorBox error={listing.error} />}
        {listing.isLoading && <Spinner label="Finding events…" />}

        {view === 'map' && listing.isSuccess && (
          <>
            <EventMap items={items} center={mapCentre} radiusKm={searchCentre ? Number(filters.radiusKm) : null} />
            <p className="muted small">The map shows the events loaded so far. The list view below has every result.</p>
          </>
        )}

        {listing.isSuccess && items.length === 0 && (
          <EmptyState title="No events match these filters" action={<button type="button" className="btn btn-ghost" onClick={clear}>Clear filters</button>}>
            Try a wider radius, another locality, or remove the date range.
          </EmptyState>
        )}

        <div className="grid-cards">
          {items.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>

        {listing.hasNextPage && (
          <div className="center">
            <button type="button" className="btn btn-ghost" onClick={() => listing.fetchNextPage()} disabled={listing.isFetchingNextPage}>
              {listing.isFetchingNextPage ? 'Loading…' : 'Load more events'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
