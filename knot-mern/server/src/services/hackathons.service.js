import { HackathonListing } from '../models/HackathonListing.js';
import curated from '../data/curatedHackathons.json' with { type: 'json' };

// Port of the original `filterLiveSeedHackathons` (src/features/hackathons/liveSeed.ts). The same
// filters, sorting, pagination and notices apply to the database listings and to the curated snapshot.
export const CURATED_NOTICE = 'Curated fallback snapshot, not a live source sync. Confirm current details on the official site.';

const toJson = (doc) => {
  const h = doc.toObject ? doc.toObject() : doc;
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  return {
    id: h.id ?? String(h._id),
    title: h.title,
    description: h.description ?? null,
    organizer: h.organizer ?? null,
    mode: h.mode,
    city: h.city ?? null,
    area: h.area ?? null,
    state: h.state ?? null,
    country: h.country ?? null,
    venue: h.venue ?? null,
    latitude: h.latitude ?? null,
    longitude: h.longitude ?? null,
    locationPrecision: h.locationPrecision,
    startDate: iso(h.startDate),
    endDate: iso(h.endDate),
    registrationDeadline: iso(h.registrationDeadline),
    timezone: h.timezone ?? null,
    startTimeKnown: h.startTimeKnown,
    endTimeKnown: h.endTimeKnown,
    isFree: h.isFree ?? null,
    priceAmount: h.priceAmount ?? null,
    currency: h.currency ?? null,
    prizePool: h.prizePool ?? null,
    tags: h.tags ?? [],
    eligibility: h.eligibility ?? null,
    teamSize: h.teamSize ?? null,
    imageUrl: h.imageUrl ?? null,
    officialUrl: h.officialUrl,
    officialUrlVerified: h.officialUrlVerified,
    sourceUrl: h.sourceUrl,
    sourcePlatform: h.sourcePlatform,
    status: computeStatus(h),
    lastCheckedAt: iso(h.lastCheckedAt),
  };
};

function computeStatus(h) {
  const now = Date.now();
  const start = new Date(h.startDate).getTime();
  const end = new Date(h.endDate ?? h.startDate).getTime();
  if (end < now) return 'ended';
  if (start <= now) return 'ongoing';
  return 'upcoming';
}

/** Applies the original filter, sort and pagination rules to a list of hackathons (plain JSON). */
export function filterHackathons(all, params = {}) {
  let filtered = [...all];
  if (params.city?.trim()) {
    const c = params.city.trim().toLowerCase();
    filtered = filtered.filter((h) => h.city?.toLowerCase().includes(c));
  }
  if (params.area?.trim()) {
    const a = params.area.trim().toLowerCase();
    filtered = filtered.filter((h) => h.area?.toLowerCase().includes(a));
  }
  if (params.mode && params.mode !== 'all') filtered = filtered.filter((h) => h.mode === params.mode);
  if (params.price && params.price !== 'all') {
    filtered = filtered.filter((h) => (params.price === 'free' ? h.isFree : !h.isFree));
  }
  if (params.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    filtered = filtered.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        (h.description && h.description.toLowerCase().includes(q)) ||
        h.tags.some((t) => t.toLowerCase().includes(q)) ||
        (h.organizer && h.organizer.toLowerCase().includes(q)),
    );
  }
  if (params.from) {
    const from = new Date(params.from).getTime();
    if (Number.isFinite(from)) filtered = filtered.filter((h) => new Date(h.endDate ?? h.startDate).getTime() >= from);
  }
  if (params.to) {
    const to = new Date(params.to).getTime();
    if (Number.isFinite(to)) filtered = filtered.filter((h) => new Date(h.startDate).getTime() <= to);
  }
  if (params.sort !== 'relevance') {
    filtered.sort((a, b) => (params.sort === 'latest' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)));
  }
  const limit = Math.max(1, params.limit ?? 12);
  const page = Math.max(1, params.page ?? 1);
  const total = filtered.length;
  return { page, limit, total, items: filtered.slice((page - 1) * limit, page * limit) };
}

const curatedJson = () => curated.hackathons.map((h) => ({ ...h, status: computeStatus(h) }));

/** Lists hackathons. Database listings are used when present; otherwise the curated snapshot is served and labelled. */
export async function listHackathons(params) {
  const dbCount = await HackathonListing.estimatedDocumentCount();
  const useDb = dbCount > 0;
  const source = useDb ? (await HackathonListing.find({}).lean()).map((doc) => toJson({ ...doc, id: String(doc._id) })) : curatedJson();
  const page = filterHackathons(source, params);
  const cities = Array.from(new Set(source.map((h) => h.city).filter(Boolean)));
  return {
    data: page.items,
    meta: {
      page: page.page,
      limit: page.limit,
      total: page.total,
      totalPages: Math.ceil(page.total / page.limit),
      lastUpdated: useDb ? new Date(Math.max(...source.map((h) => new Date(h.lastCheckedAt).getTime()))).toISOString() : curated.snapshotAt,
      dataMode: useDb ? 'database' : 'curated_fallback',
      ...(useDb ? {} : { notice: CURATED_NOTICE }),
    },
    facets: { locations: cities.map((city) => ({ city, area: null })) },
  };
}

export async function findHackathon(id) {
  if (/^[0-9a-f]{24}$/i.test(id)) {
    const doc = await HackathonListing.findById(id).lean();
    if (doc) return toJson({ ...doc, id: String(doc._id) });
  }
  const fromCurated = curated.hackathons.find((h) => h.id === id);
  return fromCurated ? { ...fromCurated, status: computeStatus(fromCurated) } : null;
}

export async function harvesterStatus() {
  const dbCount = await HackathonListing.estimatedDocumentCount();
  const last = dbCount > 0 ? await HackathonListing.findOne({}).sort({ lastCheckedAt: -1 }).lean() : null;
  return {
    lastRunAt: last ? new Date(last.lastCheckedAt).toISOString() : null,
    lastStatus: dbCount > 0 ? 'ok' : 'not_configured',
    totalUpcoming: dbCount > 0 ? await HackathonListing.countDocuments({ startDate: { $gte: new Date() } }) : 0,
    perSource: {},
  };
}
