import { QRCodeSVG } from 'qrcode.react';
import { StatusBadge } from './ui.jsx';
import { formatDateTime } from '../lib/format.js';

/** QR pass for a registration. The QR encodes the check-in payload (knot:checkin:v1:<token>), never a database id. */
export function PassCard({ registration, title }) {
  const checkedIn = Boolean(registration.checkedInAt);
  return (
    <div className="pass">
      <div className="pass-qr">
        <QRCodeSVG value={registration.checkInPayload ?? registration.passToken} size={148} level="M" marginSize={2} />
      </div>
      <div className="pass-body">
        <p className="eyebrow">Your pass</p>
        <h4>{title}</h4>
        <p className="small">
          <StatusBadge status={registration.status} /> {checkedIn ? <strong>Checked in {formatDateTime(registration.checkedInAt)}</strong> : 'Show this at the door. Organizers scan or enter the code.'}
        </p>
        <p className="small muted code-line">Code: {registration.passToken}</p>
      </div>
    </div>
  );
}
