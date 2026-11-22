// Turns a public page or an approved API record into a raw event, then into an Event draft.
// Field rules are ported from the original hackathon agent (agents/hackathon/sources/_shared.ts and
// the Knot domain parser). Values that are not present stay null. Nothing is guessed into a value.
import { load } from 'cheerio';

const EVENT_DATE_KEYS = ['startDate', 'start_date', 'startAt', 'start_at', 'start', 'starts_at', 'date'];
const DETAIL_HINT = /hackathon|datathon|buildathon|competition|challenge/i;

const firstValue = (record, keys) => {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  return null;
};

const textValue = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    return textValue(value.text ?? value.name ?? value.value ?? value.url ?? value.label ?? value.utc ?? null);
  }
  return null;
};

const numberValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const absolute = (value, base) => {
  const text = textValue(value);
  if (!text) return null;
  try {
    const url = new URL(text, base);
    // Keep the source's own spelling when it is absolute, as the original mapper does.
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return /^https?:\/\//i.test(text) ? text : url.toString();
  } catch {
    return null;
  }
};

const emptyRaw = (sourceUrl, platform) => ({
  title: null,
  description: null,
  organizer: null,
  mode: null,
  city: null,
  venue: null,
  startDate: null,
  endDate: null,
  registrationDeadline: null,
  isFree: null,
  priceAmount: null,
  currency: null,
  tags: [],
  eligibility: null,
  imageUrl: null,
  officialUrl: null,
  sourceUrl,
  platform,
  latitude: null,
  longitude: null,
});

/** Maps a mode word from a portal onto Knot's three modes. Unknown words return null. */
export function normalizeMode(value) {
  const text = String(value ?? '').toLowerCase();
  if (!text) return null;
  if (/hybrid/.test(text)) return 'hybrid';
  if (/online|virtual|remote/.test(text)) return 'online';
  if (/offline|in[\s_-]?person|on[\s_-]?site|physical/.test(text)) return 'in_person';
  return null;
}

/** Maps one approved API record (Unstop, Devfolio and similar) onto the raw event shape. */
export function mapApiRecord(record, platform, sourceUrl) {
  const raw = emptyRaw(sourceUrl, platform);
  const location = firstValue(record, ['location', 'venue', 'place']);
  const locationRecord = location && typeof location === 'object' ? location : {};
  const address = locationRecord.address && typeof locationRecord.address === 'object' ? locationRecord.address : {};
  const geo = locationRecord.geo && typeof locationRecord.geo === 'object' ? locationRecord.geo : record;
  const price = firstValue(record, ['priceAmount', 'price_amount', 'price', 'fee', 'cost']);
  const explicitFree = firstValue(record, ['isFree', 'is_free', 'free']);

  raw.title = textValue(firstValue(record, ['title', 'name', 'event_name']));
  raw.description = textValue(firstValue(record, ['description', 'summary', 'details', 'content']));
  raw.organizer = textValue(firstValue(record, ['organizer', 'organizer_name', 'host', 'group']));
  raw.mode = normalizeMode(textValue(firstValue(record, ['mode', 'attendanceMode', 'eventAttendanceMode', 'format'])));
  raw.city = textValue(firstValue(record, ['city', 'city_name'])) ?? textValue(address.addressLocality ?? locationRecord.city);
  raw.venue = textValue(location) ?? textValue(firstValue(record, ['venue_name', 'venueName']));
  raw.latitude = numberValue(firstValue(record, ['latitude', 'lat']) ?? geo.latitude ?? geo.lat);
  raw.longitude = numberValue(firstValue(record, ['longitude', 'lng', 'lon']) ?? geo.longitude ?? geo.lng ?? geo.lon);
  raw.startDate = textValue(firstValue(record, EVENT_DATE_KEYS));
  raw.endDate = textValue(firstValue(record, ['endDate', 'end_date', 'endAt', 'end_at', 'end', 'ends_at']));
  raw.registrationDeadline = textValue(firstValue(record, ['registrationDeadline', 'registration_deadline', 'deadline', 'registration_closes_at']));
  raw.isFree = typeof explicitFree === 'boolean' ? explicitFree : null;
  raw.priceAmount = numberValue(price);
  if (raw.isFree === null && raw.priceAmount !== null) raw.isFree = raw.priceAmount === 0;
  raw.currency = textValue(firstValue(record, ['currency', 'priceCurrency', 'price_currency']))?.toUpperCase() ?? null;
  const tags = firstValue(record, ['tags', 'keywords', 'themes', 'categories']);
  raw.tags = Array.isArray(tags)
    ? tags.map(textValue).filter(Boolean)
    : (textValue(tags)?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? []);
  raw.eligibility = textValue(firstValue(record, ['eligibility', 'who_can_join', 'whoCanJoin', 'audience']));
  raw.imageUrl = absolute(firstValue(record, ['imageUrl', 'image_url', 'image', 'banner', 'logo', 'cover_img', 'thumbnail_url', 'banner_image']), sourceUrl);

  let officialCandidate = firstValue(record, ['officialUrl', 'official_url', 'registrationUrl', 'registration_url', 'apply_url', 'website', 'website_url', 'event_url', 'url', 'link']);
  let sourceCandidate = firstValue(record, ['sourceUrl', 'source_url', 'public_url', 'url', 'link']);
  if (!officialCandidate && typeof record.slug === 'string' && platform === 'Devfolio') officialCandidate = `https://${record.slug}.devfolio.co`;
  if (!officialCandidate && typeof record.public_url === 'string' && platform === 'Unstop') officialCandidate = `https://unstop.com/${record.public_url}`;
  if (typeof sourceCandidate === 'string' && !/^https?:\/\//i.test(sourceCandidate) && platform === 'Unstop') sourceCandidate = `https://unstop.com/${sourceCandidate}`;
  if (!sourceCandidate && typeof record.slug === 'string' && platform === 'Devfolio') sourceCandidate = `https://devfolio.co/hackathons/${record.slug}`;
  raw.officialUrl = absolute(officialCandidate, sourceUrl);
  raw.sourceUrl = absolute(sourceCandidate, sourceUrl) ?? sourceUrl;
  return raw;
}

/** Finds event-shaped records (a title and a start date) anywhere in an API payload. */
export function collectApiRecords(value, output = [], depth = 0) {
  if (depth > 8 || output.length >= 500 || !value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) collectApiRecords(item, output, depth + 1);
    return output;
  }
  const hasTitle = firstValue(value, ['title', 'name', 'event_name']);
  const hasStart = firstValue(value, EVENT_DATE_KEYS);
  if (hasTitle && hasStart) output.push(value);
  else for (const nested of Object.values(value)) collectApiRecords(nested, output, depth + 1);
  return output;
}

const eventTypesIn = (node) => {
  const type = node?.['@type'];
  return (Array.isArray(type) ? type : [type]).map((t) => String(t ?? '').toLowerCase());
};

/** Reads schema.org Event data (JSON-LD) and Open Graph tags from a public HTML page. */
export function extractFromHtml(html, sourceUrl, platform) {
  const $ = load(html);
  const raw = emptyRaw(sourceUrl, platform);
  const events = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    let parsed;
    try {
      parsed = JSON.parse($(element).contents().text());
    } catch {
      return; // malformed JSON-LD is skipped; the page's own tags still apply
    }
    const nodes = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      if (node['@graph']) visit(node['@graph']);
    };
    visit(parsed);
    for (const node of nodes) if (eventTypesIn(node).some((t) => t.includes('event') || t === 'hackathon')) events.push(node);
  });

  const event = events[0];
  if (event) {
    raw.title = textValue(event.name);
    raw.description = event.description ? String(event.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
    raw.startDate = textValue(event.startDate);
    raw.endDate = textValue(event.endDate);
    const location = Array.isArray(event.location) ? event.location[0] : event.location;
    if (location && typeof location === 'object') {
      raw.venue = textValue(location.name);
      raw.city = textValue(location.address?.addressLocality);
      raw.mode = /virtual|online/i.test(String(location['@type'] ?? '')) ? 'online' : null;
    } else if (typeof location === 'string') raw.venue = location;
    if (event.eventAttendanceMode) raw.mode = normalizeMode(event.eventAttendanceMode) ?? raw.mode;
    const organizer = Array.isArray(event.organizer) ? event.organizer[0] : event.organizer;
    raw.organizer = textValue(organizer?.name ?? organizer);
    const offer = Array.isArray(event.offers) ? event.offers[0] : event.offers;
    if (offer && typeof offer === 'object') {
      raw.officialUrl = absolute(offer.url, sourceUrl);
      if (offer.price !== undefined) {
        raw.priceAmount = numberValue(offer.price);
        raw.isFree = raw.priceAmount === 0;
        raw.currency = textValue(offer.priceCurrency)?.toUpperCase() ?? null;
      }
    }
    raw.imageUrl = absolute(Array.isArray(event.image) ? event.image[0] : event.image, sourceUrl);
    raw.officialUrl = raw.officialUrl ?? absolute(event.url, sourceUrl);
  }

  const meta = (selector) => $(selector).first().attr('content')?.trim() || null;
  raw.title = raw.title ?? meta('meta[property="og:title"]') ?? ($('title').first().text().trim() || null);
  raw.description = raw.description ?? meta('meta[property="og:description"]') ?? meta('meta[name="description"]');
  raw.imageUrl = raw.imageUrl ?? absolute(meta('meta[property="og:image"]'), sourceUrl);

  return raw;
}

const clip = (value, max) => (value ? String(value).slice(0, max) : null);
const field = (value, confidence, evidence = '') => ({ value, confidence, evidence: clip(evidence, 200) ?? '' });
const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Builds the same { fields, form } shape the Instant Add text parser returns, so the existing review
 * screen and formFromDraft work unchanged. Structured sources (JSON-LD, approved API records) are
 * "high" confidence. Page meta tags and missing values are "medium" or "missing". Nothing is guessed.
 */
export function buildImportDraft(raw, { now = new Date(), method = 'html' } = {}) {
  const structured = method !== 'meta';
  const title = clip(raw.title?.replace(/\s+/g, ' ').trim(), 120);
  const startAt = validDate(raw.startDate);
  const endAt = validDate(raw.endDate);
  const registrationDeadline = validDate(raw.registrationDeadline);
  const mode = raw.mode ?? (raw.venue || raw.city ? 'in_person' : null);
  const eventType = DETAIL_HINT.test(`${title ?? ''} ${(raw.tags ?? []).join(' ')}`) ? 'hackathon' : 'meetup';
  const venueName = clip(raw.venue, 120);
  const city = clip(raw.city, 80);
  const registrationUrl = raw.officialUrl ?? null;

  let price = { kind: 'unknown', amountInr: null };
  const warnings = [];
  if (raw.isFree === true) price = { kind: 'free', amountInr: 0 };
  else if (raw.priceAmount !== null && raw.priceAmount > 0 && (!raw.currency || raw.currency === 'INR')) {
    price = { kind: 'paid', amountInr: Math.round(raw.priceAmount) };
  } else if (raw.priceAmount !== null && raw.priceAmount > 0) {
    warnings.push(`The source price is in ${raw.currency}. Enter the INR amount in the form.`);
  }

  const fields = {
    title: field(title, title ? (structured ? 'high' : 'medium') : 'missing', title ?? ''),
    eventType: field(eventType, structured ? 'high' : 'medium'),
    organizer: field(clip(raw.organizer, 80), raw.organizer ? 'high' : 'missing', raw.organizer ?? ''),
    startAt: field(startAt, startAt ? 'high' : 'missing', raw.startDate ?? ''),
    endAt: field(endAt, endAt ? 'high' : 'missing', raw.endDate ?? ''),
    registrationDeadline: field(registrationDeadline, registrationDeadline ? 'high' : 'missing', raw.registrationDeadline ?? ''),
    mode: field(mode, raw.mode ? 'high' : 'missing'),
    venueName: field(venueName, venueName ? 'high' : 'missing', raw.venue ?? ''),
    city: field(city, city ? 'high' : 'missing'),
    registrationUrl: field(registrationUrl, registrationUrl ? 'high' : 'missing', registrationUrl ?? ''),
    price: field(price, price.kind === 'unknown' ? 'missing' : 'high'),
    eligibility: field(clip(raw.eligibility, 300), raw.eligibility ? 'high' : 'missing', raw.eligibility ?? ''),
    age: field(null, 'missing'),
    skills: field(raw.tags?.slice(0, 12) ?? [], raw.tags?.length ? 'medium' : 'missing'),
    teamSize: field(null, 'missing'),
    summary: field(clip(raw.description?.replace(/\s+/g, ' ').trim(), 300) ?? '', raw.description ? (structured ? 'high' : 'medium') : 'missing'),
    imageUrl: field(raw.imageUrl, raw.imageUrl ? 'high' : 'missing'),
  };

  const form = {
    title: title ?? '',
    eventType,
    mode: mode ?? '',
    startAt,
    endAt,
    registrationDeadline,
    venueName: venueName ?? '',
    externalUrl: registrationUrl ?? '',
    priceKind: price.kind,
    priceAmount: price.kind === 'paid' ? price.amountInr : null,
    minAge: null,
    summary: fields.summary.value ?? '',
    onlineUrl: mode === 'online' && registrationUrl ? registrationUrl : '',
  };

  if (!startAt) warnings.push('No start date was found. Enter one in the form.');
  if (startAt && new Date(startAt) < now) warnings.push('The start date is in the past. Check it before publishing.');
  if (!mode) warnings.push('The attendance mode was not stated. Choose it in the form.');
  if (!registrationUrl) warnings.push('No registration link was found. Attendees will be sent to the source page.');
  if (raw.eligibility) warnings.push(`The source states eligibility: "${clip(raw.eligibility, 160)}". Check it against the age rule.`);
  return {
    fields,
    form,
    warnings,
    source: { platform: raw.platform ?? '', url: raw.sourceUrl ?? null, method },
    missingRequired: title ? (startAt ? [] : ['start date']) : ['title'],
  };
}
