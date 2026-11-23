import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDb, teardownTestDb, bearer } from './helpers.js';
import { filterHackathons } from '../src/services/hackathons.service.js';
import curated from '../src/data/curatedHackathons.json' with { type: 'json' };

let app;
before(async () => {
  ({ app } = await setupTestDb());
});
after(teardownTestDb);

const register = async (email) => {
  const res = await request(app).post('/api/auth/register').send({ name: 'Hack Tester', email, password: 'Tester@12345' });
  return res.body.token;
};

describe('hackathon listings (curated fallback when no harvester data)', () => {
  test('lists the curated snapshot and labels it as a fallback', async () => {
    const res = await request(app).get('/api/hackathons?limit=50');
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.dataMode, 'curated_fallback');
    assert.match(res.body.meta.notice, /Curated fallback snapshot/);
    assert.equal(res.body.meta.total, curated.hackathons.length);
    assert.equal(res.body.data.length, curated.hackathons.length);
  });

  test('pages and filters with the original query parameters', async () => {
    const page = await request(app).get('/api/hackathons?limit=5&page=2');
    assert.equal(page.body.meta.page, 2);
    assert.equal(page.body.data.length, 5);
    const online = await request(app).get('/api/hackathons?mode=online&limit=50');
    assert.ok(online.body.data.every((h) => h.mode === 'online'));
    const silchar = await request(app).get('/api/hackathons?city=silchar&limit=50');
    assert.ok(silchar.body.data.length > 0 && silchar.body.data.every((h) => /silchar/i.test(h.city)));
  });

  test('filterHackathons keeps the original sort order (soonest first)', () => {
    const { items } = filterHackathons(curated.hackathons, { sort: 'soonest', limit: 50 });
    for (let i = 1; i < items.length; i += 1) {
      assert.ok(items[i - 1].startDate.localeCompare(items[i].startDate) <= 0);
    }
  });

  test('status reports not_configured until a harvester writes listings', async () => {
    const res = await request(app).get('/api/hackathons/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.lastStatus, 'not_configured');
    assert.equal(res.body.lastRunAt, null);
  });
});

describe('interest is a handoff, not a registration', () => {
  test('anonymous interest returns the official link and is not saved', async () => {
    const id = curated.hackathons[0].id;
    const res = await request(app).post(`/api/hackathons/${id}/interest`).send({ context: 'home' });
    assert.equal(res.status, 200);
    assert.equal(res.body.saved, false);
    assert.equal(res.body.officialUrl, curated.hackathons[0].officialUrl);
  });

  test('unknown hackathon returns 404', async () => {
    const res = await request(app).post('/api/hackathons/does-not-exist/interest').send({});
    assert.equal(res.status, 404);
  });

  test('signed-in interest is saved once and appears in My Interests', async () => {
    const token = await register('hack-interest@knot.local');
    const id = curated.hackathons[1].id;
    const first = await request(app).post(`/api/hackathons/${id}/interest`).set(bearer(token)).send({ context: 'my_interests' });
    assert.equal(first.body.saved, true);
    await request(app).post(`/api/hackathons/${id}/interest`).set(bearer(token)).send({});
    const mine = await request(app).get('/api/hackathons/interests').set(bearer(token));
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.data.map((h) => h.id), [id]);
  });

  test('My Interests requires a session', async () => {
    const res = await request(app).get('/api/hackathons/interests');
    assert.equal(res.status, 401);
  });
});
