import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, SESSION_ENDED_EVENT } from '../lib/api.js';
import { getToken, setToken } from '../lib/session.js';
import { reconnectSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'anonymous');
  const [sessionNotice, setSessionNotice] = useState(null);
  // Counts sign-ins. A page-load restore that finishes after a newer sign-in must not undo it.
  const signInEpoch = useRef(0);
  // True only while this page holds a session the user signed in to (or restored successfully).
  // A stored token that the server rejects on page load is cleared quietly, with no notice.
  const liveSession = useRef(false);

  // A request was rejected for an expired or unknown session: end it everywhere, once.
  useEffect(() => {
    const onEnded = () => {
      const wasLive = liveSession.current;
      liveSession.current = false;
      setToken(null);
      setUser(null);
      setStatus('anonymous');
      if (wasLive) setSessionNotice('Your session has ended. Sign in again to continue.');
      reconnectSocket();
      queryClient.clear();
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [queryClient]);

  // Restore the session from a stored token when the app starts.
  useEffect(() => {
    if (!getToken()) return undefined;
    const epoch = signInEpoch.current;
    const restoredWith = getToken();
    let cancelled = false;
    api('/api/auth/me')
      .then(({ user: me }) => {
        if (cancelled || signInEpoch.current !== epoch) return;
        liveSession.current = true;
        setUser(me);
        setStatus('ready');
      })
      .catch(() => {
        // Ignore the result when the user has signed in since, or the token has changed.
        if (cancelled || signInEpoch.current !== epoch || getToken() !== restoredWith) return;
        setToken(null);
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const establish = useCallback(
    ({ token, user: me }) => {
      signInEpoch.current += 1;
      liveSession.current = true;
      setToken(token);
      setUser(me);
      setSessionNotice(null);
      setStatus('ready');
      reconnectSocket();
      queryClient.clear();
    },
    [queryClient],
  );

  const login = useCallback(
    async (email, password) => establish(await api('/api/auth/login', { method: 'POST', body: { email, password } })),
    [establish],
  );

  const register = useCallback(
    async (payload) => establish(await api('/api/auth/register', { method: 'POST', body: payload })),
    [establish],
  );

  const logout = useCallback(() => {
    liveSession.current = false;
    setToken(null);
    setUser(null);
    setStatus('anonymous');
    reconnectSocket();
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const { user: me } = await api('/api/auth/me');
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, refreshUser, setUser, sessionNotice }),
    [user, status, login, register, logout, refreshUser, sessionNotice],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
