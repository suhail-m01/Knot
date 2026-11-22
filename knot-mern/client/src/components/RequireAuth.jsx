import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui.jsx';

export function RequireAuth({ roles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Restoring your session…" />;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="empty">
        <h3>This area is for {roles.join(' or ')} accounts</h3>
        <p className="muted">Your account is signed in as a {user.role}.</p>
      </div>
    );
  }
  return children;
}
