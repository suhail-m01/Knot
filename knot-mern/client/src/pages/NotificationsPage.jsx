import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { EmptyState, Spinner, ErrorBox, Badge } from '../components/ui.jsx';
import { formatDateTime } from '../lib/format.js';

const TYPE_LABELS = {
  registration: 'Registration',
  promotion: 'Waitlist',
  announcement: 'Organizer update',
  reminder: 'Reminder',
  system: 'Notice',
  change: 'Event changed',
};

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api('/api/notifications') });

  const readAll = useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readOne = useMutation({
    mutationFn: (id) => api(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (notes.isLoading) return <Spinner />;
  if (notes.error) return <ErrorBox error={notes.error} />;
  const { items, unreadCount } = notes.data;

  return (
    <div className="narrow stack-lg">
      <header className="page-head">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Notifications</h1>
          <p className="muted">
            In-app only. Knot does not send email or SMS for these. {unreadCount} unread.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            Mark all as read
          </button>
        )}
      </header>

      {items.length === 0 && <EmptyState title="All caught up">Registrations, waitlist moves and organizer updates will appear here.</EmptyState>}

      <ul className="notice-list">
        {items.map((n) => (
          <li key={n.id} className={`notice ${n.readAt ? '' : 'notice-unread'}`}>
            <div className="notice-head">
              <Badge>{TYPE_LABELS[n.type] ?? n.type}</Badge>
              <span className="muted small">{formatDateTime(n.createdAt)}</span>
            </div>
            <h3>
              {n.link ? <Link to={n.link} onClick={() => !n.readAt && readOne.mutate(n.id)}>{n.title}</Link> : n.title}
            </h3>
            {n.body && <p className="muted">{n.body}</p>}
            {!n.readAt && (
              <button type="button" className="btn btn-link btn-sm" onClick={() => readOne.mutate(n.id)}>
                Mark as read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
