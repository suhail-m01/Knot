import { User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { verifyToken } from '../utils/tokens.js';

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/** Attaches req.user when a valid token is present. Invalid tokens are treated as guest access. */
export async function optionalAuth(req, _res, next) {
  const token = bearerToken(req);
  if (!token) return next();
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next();
  }
  const user = await User.findById(payload.sub);
  if (user) req.user = user;
  return next();
}

/** Requires a valid session. Loads the user fresh so role changes and deletions take effect immediately. */
export async function requireAuth(req, _res, next) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized());
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
  const user = await User.findById(payload.sub);
  if (!user) return next(unauthorized('Your account no longer exists'));
  req.user = user;
  return next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('This area is for organizers and admins'));
    return next();
  };
}
