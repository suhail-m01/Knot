// All times are shown in India Standard Time because Knot is India-first. Inputs are interpreted
// as IST too, so the result does not depend on the visitor's device clock zone.
export const IST = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' });

export function formatDateTime(iso) {
  return iso ? `${dateTime.format(new Date(iso))} IST` : '—';
}

export function formatDay(iso) {
  return iso ? dayFmt.format(new Date(iso)) : '';
}

export function formatRange(startAt, endAt) {
  if (!startAt) return '—';
  const start = formatDateTime(startAt);
  return endAt ? `${start} – ${timeFmt.format(new Date(endAt))}` : start;
}

export function formatPrice(price) {
  if (!price || price.kind === 'free') return 'Free';
  if (price.kind === 'paid') return price.amountInr != null ? `₹${price.amountInr}` : 'Paid';
  return 'Price not stated';
}

export function formatDistance(km) {
  if (km === null || km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

/** ISO string -> "YYYY-MM-DDTHH:mm" in IST, for datetime-local inputs. */
export function istInputFromIso(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DDTHH:mm" interpreted as IST -> ISO string (or null when blank). */
export function isoFromIstInput(value) {
  if (!value) return null;
  return new Date(`${value}:00+05:30`).toISOString();
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
