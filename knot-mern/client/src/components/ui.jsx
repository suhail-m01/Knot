import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// ---------- Toasts ----------
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}

// ---------- Small presentational pieces ----------
export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {error.message || String(error)}
      {error.details?.length > 0 && (
        <ul>
          {error.details.map((d, i) => (
            <li key={`${d.path}-${i}`}>
              {d.path ? <strong>{d.path}:</strong> : null} {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_TONES = {
  confirmed: 'good',
  published: 'good',
  waitlisted: 'warn',
  draft: 'muted',
  cancelled: 'bad',
  ended: 'muted',
};

export function StatusBadge({ status, label }) {
  return <span className={`badge badge-${STATUS_TONES[status] ?? 'muted'}`}>{label ?? status}</span>;
}

export function Badge({ children, tone = 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function KnotLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="currentColor" opacity="0.14" />
      <path
        d="M18 14v36M18 32c0-8 6-14 14-14h14M32 32c0 8 6 14 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="46" cy="18" r="5" fill="#f5c26b" />
    </svg>
  );
}
