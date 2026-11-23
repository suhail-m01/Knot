import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';

export function NotFoundPage() {
  return (
    <EmptyState
      title="We could not find that page"
      action={
        <Link to="/" className="btn btn-primary">
          Back to Knot
        </Link>
      }
    >
      The link may be old, or the event may have been removed.
    </EmptyState>
  );
}
