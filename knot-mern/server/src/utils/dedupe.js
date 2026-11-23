// Duplicate detection, adapted from the original Knot domain (src/domain/dedupe.ts).
// The original compares listings; the MERN model stores one URL per event, so duplicates are
// found by: the same normalised registration/online URL, or the same normalised title on the
// same IST calendar day in the same locality (or both online).

export function normalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    url.hash = '';
    url.search = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return String(value).trim().toLowerCase().replace(/\/$/, '');
  }
}

export const normalizeTitle = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Calendar day in India (IST, UTC+05:30) as YYYY-MM-DD. */
export function istDay(date) {
  const shifted = new Date(new Date(date).getTime() + 5.5 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function urlsOf(event) {
  return [event.registration?.externalUrl, event.onlineUrl].map(normalizeUrl).filter(Boolean);
}

/**
 * Returns existing events that look like the candidate. `candidate` may be a draft (plain object)
 * or a stored event; `existing` is an array of stored events (lean documents).
 */
export function findDuplicateCandidates(candidate, existing) {
  const candidateUrls = urlsOf(candidate);
  const candidateId = candidate._id ? String(candidate._id) : null;
  const candidateTitle = normalizeTitle(candidate.title);
  const candidateDay = candidate.startAt ? istDay(candidate.startAt) : null;
  const candidateArea = candidate.venue?.localityId ?? (candidate.mode === 'online' ? 'online' : null);

  return existing.filter((other) => {
    if (candidateId && String(other._id) === candidateId) return false;
    const sameUrl = candidateUrls.length > 0 && urlsOf(other).some((url) => candidateUrls.includes(url));
    if (sameUrl) return true;
    const otherArea = other.venue?.localityId ?? (other.mode === 'online' ? 'online' : null);
    return (
      candidateDay !== null &&
      istDay(other.startAt) === candidateDay &&
      candidateArea !== null &&
      otherArea === candidateArea &&
      normalizeTitle(other.title) === candidateTitle
    );
  });
}
