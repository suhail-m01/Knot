// Server-side retrieval of public event pages and approved API feeds. Ported from the original Knot
// browser adapter (src/domain/inputAdapters.ts) and hackathon agent (agents/hackathon/httpClient.ts),
// with the same limits: public http(s) only, no credentials, no private or local addresses, bounded
// size and time, and every redirect checked again before it is followed.
import dns from 'node:dns/promises';
import net from 'node:net';
import { unprocessable, AppError } from '../utils/errors.js';

export const MAX_PUBLIC_BYTES = 250_000;
export const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_TYPES = ['text/html', 'application/json', 'text/plain'];
const PRIVATE_MESSAGE = 'Local-network and private-host links are not accepted.';

/** Hostnames that name the local machine or an internal network, whatever they resolve to. */
const BLOCKED_HOSTNAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/i;

/** True for any IPv4 or IPv6 address that is not reachable on the public internet. */
export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(lower)) return true; // link local fe80::/10
    if (lower.startsWith('ff')) return true; // multicast
    const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
  }
  return true; // not an IP literal: refuse rather than guess
}

/** Validates a link the user or a source supplies. Throws a 422 with a plain message when it is not public. */
export function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw unprocessable('Enter a valid public http or https link.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw unprocessable('Only http and https links can be imported.');
  if (url.username || url.password) throw unprocessable('Links with embedded credentials are not accepted.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || BLOCKED_HOSTNAME.test(host)) throw unprocessable(PRIVATE_MESSAGE);
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw unprocessable(PRIVATE_MESSAGE);
  } else if (!host.includes('.')) {
    throw unprocessable(PRIVATE_MESSAGE); // single-label names resolve inside the network
  }
  return url;
}

async function defaultLookup(hostname) {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

/** Every address the name resolves to must be public. A name that does not resolve is refused. */
export async function assertResolvesToPublic(hostname, lookup = defaultLookup) {
  if (net.isIP(hostname)) return;
  let addresses;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw unprocessable('That site could not be reached. Paste its event text instead.');
  }
  if (!addresses?.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw unprocessable(PRIVATE_MESSAGE);
  }
}

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw unprocessable('The page is larger than the 250 KB import limit. Paste the event text instead.');
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw unprocessable('The page exceeded the 250 KB import limit.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw unprocessable('The page exceeded the 250 KB import limit.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches one public page or feed. Returns { url, contentType, body }. `fetchImpl` and `lookup` are
 * injectable so the rules can be tested without the network.
 */
export async function fetchPublic(rawUrl, { fetchImpl = fetch, lookup = defaultLookup, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_PUBLIC_BYTES, accept = 'text/html,application/json;q=0.9,text/plain;q=0.8' } = {}) {
  let current = assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertResolvesToPublic(current.hostname, lookup);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': 'KnotImporter/1.0 (public event import; no sign-in)' },
      });
      if (REDIRECT_CODES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw unprocessable('The site redirected without a destination. Paste the event text instead.');
        current = assertPublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw unprocessable(`The page returned HTTP ${response.status}; nothing was imported.`);
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(contentType)) {
        throw unprocessable('Only public HTML, JSON or plain-text event pages can be imported. Use poster OCR for an image.');
      }
      const body = await readCapped(response, maxBytes);
      return { url: current.toString(), contentType, body };
    } catch (error) {
      if (error?.name === 'AbortError') throw new AppError(504, 'The page timed out after 12 seconds. Paste the event text instead.');
      if (error instanceof AppError) throw error;
      if (error instanceof TypeError) throw new AppError(502, 'The site did not respond. Paste the event text instead.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw unprocessable('The page redirected too many times.');
}
