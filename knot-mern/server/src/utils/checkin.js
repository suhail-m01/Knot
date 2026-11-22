// Pass and check-in tokens, ported from the original Knot domain (src/domain/checkin.ts).
// A pass carries a 48-character hex token (24 random bytes). The QR code encodes the prefixed payload.
import crypto from 'node:crypto';

export const CHECK_IN_PAYLOAD_PREFIX = 'knot:checkin:v1:';

/** 24 random bytes, hex encoded (48 characters). */
export const createCheckInToken = () => crypto.randomBytes(24).toString('hex');

export const checkInPayload = (token) => `${CHECK_IN_PAYLOAD_PREFIX}${token}`;

/**
 * Accepts a Knot QR payload or the participant's manual fallback code.
 * Returns the lowercase token, or null when the value is not a well-formed token.
 * Older 24-character tokens (issued before this format) remain valid for lookups elsewhere.
 */
export function parseCheckInPayload(value) {
  const trimmed = String(value ?? '').trim();
  const token = trimmed.startsWith(CHECK_IN_PAYLOAD_PREFIX) ? trimmed.slice(CHECK_IN_PAYLOAD_PREFIX.length) : trimmed;
  return /^[a-f0-9]{48}$/i.test(token) ? token.toLowerCase() : null;
}
