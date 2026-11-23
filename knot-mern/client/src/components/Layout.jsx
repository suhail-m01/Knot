import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useToast, KnotLogo } from './ui.jsx';
import { initials } from '../lib/format.js';
import { ROLE_LABELS } from '../lib/constants.js';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/api/notifications'),
    enabled: Boolean(user),
    refetchInterval: 60000,
  });

  // Live notifications: refresh the bell count and show a toast as soon as the server pushes one.
  useEffect(() => {
    if (!user) return undefined;
    const socket = getSocket();
    const onNotification = (note) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(note.title, 'info');
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, [user, queryClient, toast]);

  const unread = notifications.data?.unreadCount ?? 0;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand" aria-label="Knot home">
            <KnotLogo />
            <span>Knot</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/discover">Discover</NavLink>
            {user && <NavLink to="/plan">My plan</NavLink>}
            {user && (user.role === 'organizer' || user.role === 'admin') && <NavLink to="/organizer">Organizer</NavLink>}
            {user && (user.role === 'organizer' || user.role === 'admin') && <NavLink to="/organizer/instant">Instant Add</NavLink>}
            {user && user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="nav-right">
            {user ? (
              <>
                <NavLink to="/notifications" className="bell" aria-label={`Notifications, ${unread} unread`}>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
                </NavLink>
                <NavLink to="/profile" className="avatar" title={user.name}>
                  {initials(user.name)}
                </NavLink>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-primary btn-sm">
                  Join Knot
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>
            Knot · built with MongoDB, Express, React and Node.js
            {user ? ` · signed in as ${user.name} (${ROLE_LABELS[user.role]})` : ''}
          </span>
          <span className="muted">Times shown in IST. Registrations on external sites are not Knot registrations.</span>
        </div>
      </footer>
    </div>
  );
}
