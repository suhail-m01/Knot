// Labelled sample text must stay valid as time passes. Samples are dated relative to "now" in India time,
// so an example never becomes a past event that review would reject.
const IST = 'Asia/Kolkata';

/** dd/mm/yyyy for the India-time calendar day `days` after `now`. */
export function istDayMonthYear(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toLocaleDateString('en-GB', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** yyyy-mm-dd for the India-time calendar day `days` after `now`. */
export function istIsoDate(days: number, now: Date = new Date()): string {
  const [day, month, year] = istDayMonthYear(days, now).split('/');
  return `${year}-${month}-${day}`;
}
