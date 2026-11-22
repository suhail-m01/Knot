import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, teardownTestDb, bearer } from './helpers.js';
import { assertPublicUrl, isPrivateAddress, fetchPublic } from '../src/importers/publicFetch.js';
import { extractFromHtml, mapApiRecord, buildImportDraft, normalizeMode } from '../src/importers/extract.js';
import { listApprovedSources, sourceForHost } from '../src/importers/sources.js';
import { discoverFromSource, importEventLink } from '../src/services/portalImport.service.js';

// DNS is stubbed so the tests never touch the network. Every name resolves to a public address.
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];
const future = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

const html = (body, type = 'text/html; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { 'content-type': type } });
const json = (value) => html(JSON.stringify(value), 'application/json');

const EVENT_PAGE = `<!doctype html><html><head><title>Fallback</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Bengaluru AI Builders Hackathon',
  startDate: '2030-12-05T18:30:00+05:30',
  endDate: '2030-12-06T18:00:00+05:30',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: { '@type': 'Place', name: 'Startup Hub Koramangala', address: { addressLocality: 'Bengaluru' } },
  organizer: { '@type': 'Organization', name: 'Community Circle' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR', url: 'https://example.org/register/ai-night' },
  description: '<p>Build an AI product in 24 hours.</p>',
})}</script></head><body><main>Hello</main></body></html>`;

describe('address and URL policy', () => {
  test('private, local and reserved addresses are not public', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    assert.equal(isPrivateAddress('93.184.216.34'), false);
    assert.equal(isPrivateAddress('2606:2800:220:1::1'), false);
  });

  test('only public http and https links without credentials are accepted', () => {
    assert.equal(assertPublicUrl('https://unstop.com/hackathons/x-1').hostname, 'unstop.com');
    for (const bad of ['ftp://unstop.com/x', 'file:///etc/passwd', 'http://localhost:5000/api', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://intranet/', 'https://user:pass@unstop.com/x', 'not a url']) {
      assert.throws(() => assertPublicUrl(bad), (e) => e.status === 422, bad);
    }
  });

  test('a name that resolves to a private address is refused', async () => {
    await assert.rejects(
      fetchPublic('https://events.example.com/x', { fetchImpl: async () => html('x'), lookup: privateLookup }),
      (e) => e.status === 422 && /private/i.test(e.message),
    );
  });

  test('redirects are followed only when each hop is public', async () => {
    const hops = [];
    const fetchImpl = async (url) => {
      hops.push(url);
      if (url === 'https://a.example.com/x') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
      return html('ok');
    };
    await assert.rejects(fetchPublic('https://a.example.com/x', { fetchImpl, lookup: publicLookup }), (e) => e.status === 422);
    assert.deepEqual(hops, ['https://a.example.com/x']);
  });

  test('unsupported content, HTTP errors and oversized pages are refused', async () => {
    await assert.rejects(fetchPublic('https://a.example.com/i', { fetchImpl: async () => html('x', 'image/png'), lookup: publicLookup }), (e) => e.status === 422);
    await assert.rejects(fetchPublic('https://a.example.com/m', { fetchImpl: async () => html('nope', 'text/html', 404), lookup: publicLookup }), (e) => e.status === 422 && /404/.test(e.message));
    const big = 'x'.repeat(260_000);
    await assert.rejects(fetchPublic('https://a.example.com/big', { fetchImpl: async () => html(big), lookup: publicLookup }), (e) => e.status === 422 && /250 KB/.test(e.message));
  });
});

describe('source policy', () => {
  test('only enabled API sources are listed, and disabled sources are never matched', () => {
    const ids = listApprovedSources().map((s) => s.id);
    assert.deepEqual(ids.sort(), ['devfolio', 'unstop']);
    assert.equal(sourceForHost('devpost.com'), null);
    assert.equal(sourceForHost('lu.ma'), null);
    assert.equal(sourceForHost('unstop.com').id, 'unstop');
    assert.equal(sourceForHost('acme.devfolio.co').id, 'devfolio');
  });
});

describe('extraction', () => {
  test('JSON-LD Event data becomes high-confidence fields', () => {
    const raw = extractFromHtml(EVENT_PAGE, 'https://example.org/event', 'Web page');
    const draft = buildImportDraft(raw, { method: 'html', now: new Date('2030-01-01') });
    assert.equal(draft.fields.title.value, 'Bengaluru AI Builders Hackathon');
    assert.equal(draft.fields.title.confidence, 'high');
    assert.equal(draft.form.eventType, 'hackathon');
    assert.equal(draft.form.mode, 'in_person');
    assert.equal(draft.form.priceKind, 'free');
    assert.equal(draft.form.externalUrl, 'https://example.org/register/ai-night');
    assert.equal(draft.fields.venueName.value, 'Startup Hub Koramangala');
    assert.equal(draft.form.startAt, '2030-12-05T13:00:00.000Z');
    assert.equal(draft.fields.organizer.value, 'Community Circle');
    assert.equal(draft.fields.age.value, null); // the page does not state an age rule, so none is invented
  });

  test('a page with only meta tags is medium confidence and missing dates stay empty', () => {
    const page = '<html><head><meta property="og:title" content="Campus Jam"><meta property="og:description" content="A jam."></head></html>';
    const draft = buildImportDraft(extractFromHtml(page, 'https://example.org/j', 'Web page'), { method: 'meta' });
    assert.equal(draft.fields.title.value, 'Campus Jam');
    assert.equal(draft.fields.title.confidence, 'medium');
    assert.equal(draft.form.startAt, null);
    assert.ok(draft.missingRequired.includes('start date'));
  });

  test('Unstop and Devfolio records map to their public links, as in the original adapter', () => {
    const unstop = mapApiRecord({ title: 'Code Sprint', start_date: '2030-02-01T10:00:00Z', public_url: 'hackathons/code-sprint-99', is_free: true }, 'Unstop', 'https://unstop.com/api');
    assert.equal(unstop.officialUrl, 'https://unstop.com/hackathons/code-sprint-99');
    const devfolio = mapApiRecord({ name: 'Devfolio Build', startDate: '2030-03-01', slug: 'build-2030', mode: 'Hybrid' }, 'Devfolio', 'https://api.devfolio.co/api/hackathons');
    assert.equal(devfolio.officialUrl, 'https://build-2030.devfolio.co');
    assert.equal(devfolio.mode, 'hybrid');
    assert.equal(normalizeMode('Offline'), 'in_person');
  });
});

describe('importEventLink and discovery', () => {
  before(async () => {
    await setupTestDb();
  });
  after(teardownTestDb);

  const unstopListing = {
    data: [
      { title: 'Code Sprint', start_date: '2030-02-01T10:00:00Z', public_url: 'hackathons/code-sprint-99', is_free: true, location: 'Bengaluru' },
      { title: 'Other Event', start_date: '2030-02-05T10:00:00Z', public_url: 'hackathons/other-1' },
    ],
  };

  test('an approved-source link is matched to its listing record (structured, high confidence)', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return json(unstopListing);
    };
    const result = await importEventLink('https://unstop.com/hackathons/code-sprint-99/', { fetchImpl, lookup: publicLookup, now: new Date('2029-01-01') });
    assert.equal(result.source.method, 'api');
    assert.equal(result.form.title, 'Code Sprint');
    assert.equal(result.fields.title.confidence, 'high');
    assert.equal(result.form.priceKind, 'free');
    assert.equal(result.source.reviewRequired, true);
    assert.ok(calls.every((url) => url.startsWith('https://unstop.com/api/public/opportunity')));
  });

  test('a link not in the listing falls back to the page itself, as the original URL import does', async () => {
    const fetchImpl = async (url) => (url.includes('/api/') ? json({ data: [] }) : html(EVENT_PAGE));
    const result = await importEventLink('https://unstop.com/hackathons/elsewhere-5', { fetchImpl, lookup: publicLookup, now: new Date('2029-01-01') });
    assert.equal(result.source.method, 'html');
    assert.equal(result.form.title, 'Bengaluru AI Builders Hackathon');
  });

  test('a page with no event details is refused with guidance to paste text', async () => {
    await assert.rejects(
      importEventLink('https://example.org/blog', { fetchImpl: async () => html('<html><body>Hello</body></html>'), lookup: publicLookup }),
      (e) => e.status === 422 && /Paste the event text/.test(e.message),
    );
  });

  test('discovery returns mapped items from an approved source, and refuses unknown sources', async () => {
    const items = await discoverFromSource('unstop', { fetchImpl: async () => json(unstopListing), lookup: publicLookup });
    assert.equal(items.length, 2);
    assert.equal(items[0].url, 'https://unstop.com/hackathons/code-sprint-99');
    await assert.rejects(discoverFromSource('devpost', { fetchImpl: async () => json({}), lookup: publicLookup }), (e) => e.status === 400);
  });
});

describe('organizer portal routes', () => {
  let app;
  let organizer;
  let participant;

  before(async () => {
    ({ app } = await setupTestDb());
    const org = await request(app).post('/api/auth/register').send({ name: 'Org Person', email: 'org.portal@knot.local', password: 'Password123', role: 'organizer', dateOfBirth: '1990-01-01' });
    organizer = org.body.token;
    const part = await request(app).post('/api/auth/register').send({ name: 'Part Person', email: 'part.portal@knot.local', password: 'Password123', role: 'participant', dateOfBirth: '2000-01-01' });
    participant = part.body.token;
  });
  after(teardownTestDb);

  test('the routes need an organizer session', async () => {
    assert.equal((await request(app).get('/api/organizer/import/sources')).status, 401);
    assert.equal((await request(app).get('/api/organizer/import/sources').set(bearer(participant))).status, 403);
  });

  test('the source list shows only enabled, approved sources', async () => {
    const res = await request(app).get('/api/organizer/import/sources').set(bearer(organizer));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((s) => s.id).sort(), ['devfolio', 'unstop']);
  });

  test('private, local and disabled-source links are refused before any request is made', async () => {
    for (const url of ['http://127.0.0.1:5000/api/health', 'http://localhost:5000/', 'https://user:pw@unstop.com/x']) {
      const res = await request(app).post('/api/organizer/import/link').set(bearer(organizer)).send({ url });
      assert.equal(res.status, 422, url);
    }
    const res = await request(app).get('/api/organizer/import/discover?source=devpost').set(bearer(organizer));
    assert.equal(res.status, 400);
  });

  test('a link is required', async () => {
    const res = await request(app).post('/api/organizer/import/link').set(bearer(organizer)).send({});
    assert.equal(res.status, 400);
  });
});
