import { Event } from '../models/index.js';
import { findDuplicateCandidates } from '../utils/dedupe.js';
import { badRequest, unprocessable } from '../utils/errors.js';
import { fetchPublic, assertPublicUrl } from '../importers/publicFetch.js';
import { buildImportDraft, collectApiRecords, extractFromHtml, mapApiRecord } from '../importers/extract.js';
import { approvedSource, comparableUrl, listApprovedSources, sourceForHost } from '../importers/sources.js';

const API_ACCEPT = 'application/json;q=1,text/html;q=0.1';

async function readJsonFeed(url, { fetchImpl, lookup }) {
  const page = await fetchPublic(url, { fetchImpl, lookup, accept: API_ACCEPT });
  try {
    return JSON.parse(page.body);
  } catch {
    throw unprocessable('The source returned data that could not be read. Try again later or paste the event text.');
  }
}

/** Lists records from one approved API source, mapped to the raw event shape. */
export async function discoverFromSource(sourceId, { fetchImpl = fetch, lookup, limit = 20 } = {}) {
  const source = approvedSource(sourceId);
  if (!source) throw badRequest('That source is not enabled for import.');
  const platform = source.label;
  const records = [];
  for (const url of source.discoveryUrls) {
    const payload = await readJsonFeed(url, { fetchImpl, lookup });
    for (const record of collectApiRecords(payload)) records.push(mapApiRecord(record, platform, url));
  }
  return records.slice(0, limit).map((raw) => {
    const draft = buildImportDraft(raw, { method: 'api' });
    return {
      title: draft.form.title,
      startAt: draft.form.startAt,
      mode: draft.form.mode || null,
      url: raw.officialUrl ?? raw.sourceUrl,
      source: { platform, id: sourceId },
    };
  }).filter((item) => item.title && item.url);
}

async function duplicatesFor(form, localityId, now) {
  const candidate = {
    title: form.title,
    startAt: form.startAt ? new Date(form.startAt) : null,
    mode: form.mode || 'in_person',
    onlineUrl: form.onlineUrl,
    registration: { externalUrl: form.externalUrl },
    venue: { localityId },
  };
  if (!candidate.startAt || !candidate.title) return [];
  const existing = await Event.find({ status: 'published', startAt: { $gte: new Date(now.getTime() - 2 * 86_400_000) } })
    .sort({ startAt: 1 })
    .limit(1000)
    .lean();
  return findDuplicateCandidates(candidate, existing).map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    startAt: doc.startAt.toISOString(),
    status: doc.status,
  }));
}

/**
 * Reads one public event link into an Instant-Add style draft. An approved-source link is matched to
 * its listing first, which gives structured fields. Otherwise the page's own JSON-LD and meta tags are read,
 * as the original URL import does. Nothing is published; the organiser reviews the draft in the form.
 */
export async function importEventLink(rawUrl, { localityId = null, fetchImpl = fetch, lookup, now = new Date() } = {}) {
  const url = assertPublicUrl(rawUrl);
  const source = sourceForHost(url.hostname);
  let draft = null;

  if (source) {
    const wanted = comparableUrl(url.toString());
    const payload = [];
    for (const feed of source.discoveryUrls) {
      const body = await readJsonFeed(feed, { fetchImpl, lookup }).catch(() => null);
      if (body) payload.push(...collectApiRecords(body));
    }
    const hit = payload
      .map((record) => mapApiRecord(record, source.label, source.discoveryUrls[0]))
      .find((raw) => [raw.officialUrl, raw.sourceUrl].some((candidate) => candidate && comparableUrl(candidate) === wanted));
    if (hit) draft = buildImportDraft(hit, { now, method: 'api' });
  }

  if (!draft) {
    const page = await fetchPublic(url.toString(), { fetchImpl, lookup });
    const raw = extractFromHtml(page.body, page.url, source?.label ?? 'Web page');
    if (!raw.title && !raw.startDate) {
      throw unprocessable('No event details were found on that page. Paste the event text in the box below instead.');
    }
    draft = buildImportDraft(raw, { now, method: 'html' });
  }

  const duplicates = await duplicatesFor(draft.form, localityId, now);
  return {
    source: { ...draft.source, label: draft.source.platform, reviewRequired: true },
    fields: draft.fields,
    form: draft.form,
    warnings: draft.warnings,
    missingRequired: draft.missingRequired,
    duplicates,
    localityChecked: Boolean(localityId),
  };
}

