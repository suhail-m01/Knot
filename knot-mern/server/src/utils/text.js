/** Escapes user input before it is placed inside a RegExp (prevents ReDoS and regex injection). */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converts blank strings to null, otherwise returns the trimmed value. */
export function blankToNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export const isObjectIdString = (value) => /^[a-f\d]{24}$/i.test(String(value));
