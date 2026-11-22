import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { HackathonInterest } from '../models/index.js';
import { findHackathon, harvesterStatus, listHackathons } from '../services/hackathons.service.js';
import { notFound } from '../utils/errors.js';

const router = Router();
const INTEREST_CONTEXTS = ['web', 'home', 'my_interests'];

// GET /api/hackathons — same query parameters as the original client (src/features/hackathons/api.ts).
router.get('/', async (req, res) => {
  const q = req.query;
  const num = (value, fallback) => {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const result = await listHackathons({
    city: typeof q.city === 'string' ? q.city : '',
    area: typeof q.area === 'string' ? q.area : '',
    mode: typeof q.mode === 'string' ? q.mode : 'all',
    from: typeof q.from === 'string' ? q.from : '',
    to: typeof q.to === 'string' ? q.to : '',
    price: typeof q.price === 'string' ? q.price : 'all',
    q: typeof q.q === 'string' ? q.q : '',
    sort: typeof q.sort === 'string' ? q.sort : 'soonest',
    page: num(q.page, 1),
    limit: Math.min(num(q.limit, 12), 50),
  });
  res.set('Cache-Control', 'no-store');
  res.json(result);
});

// GET /api/hackathons/status — harvester status; "not_configured" until a harvester has written listings.
router.get('/status', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await harvesterStatus());
});

// GET /api/hackathons/interests — the signed-in user's Interested hackathons (My Interests).
router.get('/interests', requireAuth, async (req, res) => {
  const rows = await HackathonInterest.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  const items = await Promise.all(rows.map((row) => findHackathon(row.hackathonId)));
  res.json({ data: items.filter(Boolean) });
});

// POST /api/hackathons/:id/interest — records Interested, then hands the person to the official site.
// This is not a registration: the response carries only the official link.
router.post('/:id/interest', optionalAuth, async (req, res) => {
  const hackathon = await findHackathon(req.params.id);
  if (!hackathon) throw notFound('Hackathon not found.');
  const context = INTEREST_CONTEXTS.includes(req.body?.context) ? req.body.context : 'web';
  let interestId = null;
  let saved = false;
  if (req.user) {
    const row = await HackathonInterest.findOneAndUpdate(
      { userId: req.user._id, hackathonId: hackathon.id },
      { $set: { context } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    interestId = String(row._id);
    saved = true;
  }
  res.json({
    interestId,
    officialUrl: hackathon.officialUrl,
    officialUrlVerified: hackathon.officialUrlVerified,
    saved,
  });
});

export default router;
