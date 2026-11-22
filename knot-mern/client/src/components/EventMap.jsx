import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, Circle, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_CENTER } from '../lib/constants.js';

// Basemap is configurable. OpenStreetMap is the development default; production should use a
// provider with an agreed usage policy (see README).
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors';

function FitToPoints({ points }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(
      points.map((p) => [p.lat, p.lng]),
      { padding: [40, 40], maxZoom: 14 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Read-only map of events. Markers link to the event page; the list beside it stays accessible. */
export function EventMap({ items, center, radiusKm, height = 460 }) {
  const points = items
    .filter((i) => i.venue?.lat != null && i.venue?.lng != null)
    .map((i) => ({ id: i.id, title: i.title, lat: i.venue.lat, lng: i.venue.lng }));
  const c = center ?? DEFAULT_CENTER;

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer center={[c.lat, c.lng]} zoom={12} scrollWheelZoom className="map">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} referrerPolicy="strict-origin-when-cross-origin" />
        {center && radiusKm ? (
          <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: '#2c6e63', weight: 1, fillOpacity: 0.06 }} />
        ) : null}
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{ color: '#17423b', fillColor: '#2c9c83', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>
              <strong>{p.title}</strong>
              <br />
              <Link to={`/events/${p.id}`}>View event</Link>
            </Popup>
          </CircleMarker>
        ))}
        <FitToPoints points={points} />
      </MapContainer>
      {points.length === 0 && <p className="map-empty muted">No in-person events with a map location in this view.</p>}
    </div>
  );
}

function ClickToPick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

function Recentre({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], map.getZoom());
  }, [map, lat, lng]);
  return null;
}

/** Click the map to set the exact venue point used for distance-based discovery. */
export function MapPicker({ value, onChange, fallback }) {
  const base = value?.lat != null ? value : fallback ?? DEFAULT_CENTER;
  return (
    <div className="map-wrap map-picker">
      <MapContainer center={[base.lat, base.lng]} zoom={14} className="map">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} referrerPolicy="strict-origin-when-cross-origin" />
        <ClickToPick onPick={(lat, lng) => onChange({ lat, lng })} />
        {value?.lat != null && (
          <CircleMarker center={[value.lat, value.lng]} radius={9} pathOptions={{ color: '#7a4b00', fillColor: '#f5c26b', fillOpacity: 1 }} />
        )}
        <Recentre lat={base.lat} lng={base.lng} />
      </MapContainer>
      <p className="muted small">Click the map to pin the exact venue. Current pin: {value?.lat != null ? `${value.lat}, ${value.lng}` : 'none (uses the locality centre)'}.</p>
    </div>
  );
}
