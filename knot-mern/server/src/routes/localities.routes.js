import { Router } from 'express';
import { Locality } from '../models/index.js';
import { escapeRegex } from '../utils/text.js';

const router = Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const filter = q
    ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { aliases: new RegExp(escapeRegex(q), 'i') }] }
    : {};
  const docs = await Locality.find(filter).sort({ name: 1 }).lean();
  res.json({
    items: docs.map((l) => ({ id: l._id, name: l.name, city: l.city, country: l.country, lat: l.lat, lng: l.lng })),
  });
});

export default router;
