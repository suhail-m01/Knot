export const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two WGS84 points, in kilometres. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A latitude/longitude box that fully contains a circle of `radiusKm` around a point.
 * Works with plain numeric indexes on any MongoDB deployment, so the app does not depend on
 * a 2dsphere index. Exact distances are then checked with haversineKm.
 */
export function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / 110.574;
  const cos = Math.max(Math.cos(toRad(lat)), 0.01);
  const dLng = radiusKm / (111.32 * cos);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}
