// RFC 5545 iCalendar export so people can add Knot events to any calendar app.

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** 2026-11-22T10:30:00.000Z -> 20261122T103000Z */
export function toIcsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escapes text per RFC 5545 section 3.3.11. */
export function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Lines longer than 75 octets must be folded: continuation lines start with a space. */
export function foldLine(line) {
  const chars = Array.from(line);
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of chars) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (bytes + size > 75) {
      parts.push(current);
      current = ch;
      bytes = size + 1; // leading space on continuation lines counts toward the limit
    } else {
      current += ch;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
}

/**
 * @param {object} event serialized event (id, title, summary, startAt, endAt, venue, mode, onlineUrl)
 * @param {{ url?: string, now?: Date }} options
 */
export function buildIcs(event, { url = '', now = new Date() } = {}) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const place = [event.venue?.name, event.venue?.address].filter(Boolean).join(', ');
  const location = place || (event.mode === 'online' ? event.onlineUrl || 'Online' : '');
  const description = [event.summary, url].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Knot//MERN Event Discovery//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@knot.local`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
