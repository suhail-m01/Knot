// Session token storage. The JWT is kept in localStorage when the browser allows it, and always
// in memory for the lifetime of the page. Embedded frames (for example, a preview inside another
// site) often block localStorage; the in-memory copy keeps sign-in working there.
//
// The in-memory copy lives on globalThis rather than in this module. During development, Vite
// re-runs a module after an edit; a module-level variable would be reset at that moment while the
// React tree still shows the user as signed in. That mismatch produced "Please sign in" errors on
// pages that looked signed in. Keep the session short-lived server-side (JWT_EXPIRES_IN) and never
// place secrets in VITE_* variables.
const KEY = 'knot.token';

function slot() {
  if (!globalThis.__knotSession) globalThis.__knotSession = { token: null };
  return globalThis.__knotSession;
}

function readStorage() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getToken() {
  return slot().token || readStorage();
}

export function setToken(token) {
  slot().token = token || null;
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (blocked or private mode): the in-memory token still applies */
  }
}

/** True when the token could be written to persistent storage (sessions survive a reload). */
export function canPersistSession() {
  try {
    const probe = '__knot_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
