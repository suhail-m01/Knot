import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validation/schemas.js';
import { serializeUser } from '../utils/serialize.js';
import { signToken } from '../utils/tokens.js';
import { conflict, unauthorized } from '../utils/errors.js';

const router = Router();

// A fixed dummy hash lets login take the same time whether or not the email exists.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO8D2fS4p1BuKtzbnt0kLUzkqnZsV5y4a';

router.post('/register', validate(registerSchema), async (req, res) => {
  const { name, email, password, dateOfBirth, role } = req.valid.body;
  if (await User.exists({ email })) throw conflict('An account with this email already exists.');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash, dateOfBirth, role });
  res.status(201).json({ token: signToken(user), user: serializeUser(user) });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Email or password is incorrect.');
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), user: serializeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

export default router;
