// Typo-tolerant text search, ported from the original Knot discovery domain (src/domain/discovery.ts).
// Scores are deterministic: an exact phrase ranks highest, then every query token must match a
// candidate word, exactly, by prefix, or within a small edit distance scaled to the token length.

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Bounded edit distance keeps local typo tolerance predictable on small catalogs. */
export function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  if (left === right) return true;
  if (!left || !right) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j += 1) {
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      current[j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return false;
    previous = current;
  }
  return previous[right.length] <= maximum;
}

function tokenScore(query, candidate) {
  if (candidate === query) return 1;
  if (candidate.startsWith(query) || query.startsWith(candidate)) return 0.92;
  const allowed = query.length <= 3 ? 0 : query.length <= 7 ? 1 : 2;
  return allowed > 0 && editDistanceWithin(query, candidate, allowed) ? 0.78 : 0;
}

/**
 * Returns zero for no match and a positive relevance score otherwise.
 * `fields` is an array of strings (title, summary, organiser, type, interests, ...).
 */
export function textSearchScore(fields, rawQuery) {
  // A blank query is no filter. A query made only of punctuation has nothing to match, so it matches nothing.
  if (!String(rawQuery ?? '').trim()) return 1;
  const phrase = normalize(rawQuery);
  if (!phrase) return 0;
  const haystack = normalize(fields.filter(Boolean).join(' '));
  if (haystack.includes(phrase)) return phrase.includes(' ') ? 3 : 2;
  const candidates = haystack.split(' ').filter(Boolean);
  const tokens = phrase.split(' ');
  let score = 0;
  for (const queryToken of tokens) {
    let best = 0;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - queryToken.length) > 2 && !candidate.startsWith(queryToken)) continue;
      best = Math.max(best, tokenScore(queryToken, candidate));
      if (best === 1) break;
    }
    if (best === 0) return 0;
    score += best;
  }
  return score / tokens.length;
}
