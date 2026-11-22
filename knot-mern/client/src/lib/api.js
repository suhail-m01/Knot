import { getToken } from './session.js';

/** Fired on window when the server rejects a session that had a token. AuthContext ends the session. */
export const SESSION_ENDED_EVENT = 'knot:session-ended';
const SESSION_EXEMPT = ['/api/auth/login', '/api/auth/register'];

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Builds a query string, skipping empty values and arrays are comma-joined. */
export function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Thin fetch wrapper. All URLs are relative (/api/...) and the session token is attached
 * automatically. Errors are normalised to ApiError with the server's message.
 */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  // Login and register do not use a session, so a stale token is not sent with them.
  const sessionFree = SESSION_EXEMPT.some((exempt) => path.startsWith(exempt));
  const token = sessionFree ? null : getToken();
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Cannot reach the Knot server. Check your connection and try again.', 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  // Only a rejection of the token that is still current ends the session. A slow response to an
  // older token (sent before a fresh sign-in) must not sign the user out again.
  const current = token && getToken() === token;
  if (res.status === 401 && token && !SESSION_EXEMPT.some((exempt) => path.startsWith(exempt))) {
    if (current) window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT));
    throw new ApiError(current ? 'Your session has ended. Sign in again to continue.' : 'This request used an earlier session. Try again.', 401);
  }
  if (!res.ok) {
    const message = data.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data.details);
  }
  return data;
}

/** Downloads an authenticated file (CSV export) without exposing the token in the URL. */
export async function downloadFile(path, filename) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'Download failed', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
