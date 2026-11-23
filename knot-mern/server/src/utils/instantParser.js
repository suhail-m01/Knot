// Instant Add: turns pasted event text into a reviewable draft. Ported from the original Knot
// parser (src/domain/parser.ts). Every field carries a confidence and the evidence it came from.
// Unknown values stay null; nothing is guessed into a favourable value. Dates are read as IST.

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

const EVENT_TYPE_PATTERNS = [
  ['hackathon', /hackathon|hack\s*day/i],
  ['workshop', /workshop|bootcamp/i],
  ['meetup', /meetup|meet-up/i],
  ['conference', /conference|summit/i],
  ['competition', /competition|contest|challenge/i],
  ['webinar', /webinar/i],
  ['community_session', /community|session/i],
];

const SKILLS = ['Python', 'React', 'JavaScript', 'TypeScript', 'AI/ML', 'Design', 'Figma', 'Cloud', 'Cybersecurity', 'Data', 'Mobile', 'Hardware/IoT', 'Open Source'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const field = (value, confidence, evidence = '') => ({ value, confidence, evidence });

/** Builds an IST wall-clock time as a UTC instant. Returns null for impossible dates. */
function istInstant(year, month, day, hour = 18, minute = 0) {
  const utc = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS;
  const check = new Date(utc + IST_OFFSET_MS);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(utc);
}

function istYear(now) {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCFullYear();
}

/** Reads a numeric day/month date (dd/mm, dd-mm-yyyy). Returns null when it is not a valid date. */
function parseNumericDate(text, now) {
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!numeric) return null;
  const day = Number(numeric[1]);
  const month = Number(numeric[2]);
  let year = istYear(now);
  let confidence = 'medium';
  if (numeric[3]) {
    year = Number(numeric[3]);
    if (year < 100) year += 2000;
    confidence = 'high';
  }
  let candidate = istInstant(year, month, day, 18, 0);
  if (!candidate) return null;
  if (!numeric[3] && candidate.getTime() < now.getTime()) candidate = istInstant(year + 1, month, day, 18, 0) ?? candidate;
  return { candidate, confidence, evidence: numeric[0] };
}

/** Reads a "5 Dec 2026" style date. */
function parseNamedDate(text, now) {
  const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*,?\s*(\d{4})?\b/i);
  if (!named) return null;
  const day = Number(named[1]);
  const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
  const year = named[3] ? Number(named[3]) : istYear(now);
  let candidate = istInstant(year, month, day, 18, 0);
  if (!candidate) return null;
  if (!named[3] && candidate.getTime() < now.getTime()) candidate = istInstant(year + 1, month, day, 18, 0) ?? candidate;
  return { candidate, confidence: named[3] ? 'high' : 'medium', evidence: named[0] };
}

function parseDate(rawText, now) {
  const iso = rawText.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?\b/);
  if (iso) {
    const parsed = new Date(iso[0]);
    if (Number.isFinite(parsed.getTime())) {
      return { value: parsed.toISOString(), confidence: 'high', evidence: iso[0] };
    }
  }
  // Age ranges such as "10-14 years" or "ages 10-12" look like day/month dates; remove them first.
  const text = rawText
    .replace(/\bages?\s*\d{1,2}\s*[–-]\s*\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}\s*[–-]\s*\d{1,2}\s*(?:years?|yrs?)\b/gi, ' ');
  const found = parseNumericDate(text, now) ?? parseNamedDate(text, now);
  if (!found) return null;
  let { candidate } = found;
  const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (time) {
    let hour = Number(time[1]) % 12;
    if (time[3].toUpperCase() === 'PM') hour += 12;
    const ist = new Date(candidate.getTime() + IST_OFFSET_MS);
    candidate = istInstant(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate(), hour, Number(time[2] ?? 0)) ?? candidate;
  }
  return {
    value: candidate.toISOString(),
    confidence: found.confidence,
    evidence: `${found.evidence}${time ? ` ${time[0]}` : ''}`,
  };
}

function parseAge(text) {
  const range = text.match(/\b(?:ages?\s*)?(\d{1,2})\s*[–-]\s*(\d{1,2})\s*(?:years?|yrs?)?\b/i);
  if (range && Number(range[1]) >= 5 && Number(range[2]) <= 100) {
    return field({ minAge: Number(range[1]), maxAge: Number(range[2]) }, 'high', range[0]);
  }
  const minimum = text.match(/\b(?:ages?\s*)?(\d{1,2})\s*\+(?!\d)/i);
  if (minimum && Number(minimum[1]) >= 5 && Number(minimum[1]) <= 100) {
    return field({ minAge: Number(minimum[1]), maxAge: null }, 'high', minimum[0]);
  }
  if (/class\s+\d|grade\s+\d|school students|college students|freshers/i.test(text)) {
    const note = text.match(/class\s+\d[^.\n]*|grade\s+\d[^.\n]*|school students|college students|freshers/i)?.[0] ?? '';
    return field({ minAge: null, maxAge: null }, 'low', `Age cannot be inferred from class, grade or student wording: ${note}`);
  }
  return field({ minAge: null, maxAge: null }, 'missing');
}

/**
 * Parses pasted text. `now` is injectable for tests. Returns { fields, form } where `form` is the
 * subset that maps directly onto the event form. Unknown values are null, never guessed.
 */
export function parseInstantText(rawText, now = new Date()) {
  const text = String(rawText ?? '').trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const explicitTitle =
    lines.find((line) => /^title\s*:/i.test(line))?.replace(/^title\s*:\s*/i, '') ??
    lines.find((line) => /^page title\s*:/i.test(line))?.replace(/^page title\s*:\s*/i, '') ??
    null;
  const titleLine =
    explicitTitle ??
    lines.find(
      (line) =>
        line.length >= 5 &&
        line.length <= 120 &&
        !/^(source url|date|time|start|end|venue|location|register|event url|eligibility|description|page summary|price evidence)\b/i.test(line) &&
        !/^https?:\/\//i.test(line),
    ) ??
    null;

  const date = parseDate(text, now);
  const endLine = lines.find((line) => /^end\s*:/i.test(line));
  const endDate = endLine ? parseDate(endLine, now) : null;
  const deadlineLine = lines.find((line) => /^(registration deadline|register by)\s*:/i.test(line));
  const deadline = deadlineLine ? parseDate(deadlineLine, now) : null;

  const venueLine = lines.find((line) => /^(venue|location)\s*[:-]/i.test(line));
  const venueValue = venueLine?.replace(/^(venue|location)\s*[:-]\s*/i, '') ?? null;

  const registrationLine = lines.find((line) => /^(register|registration|rsvp|event url|join)\s*[:-]/i.test(line));
  const labelledUrl = registrationLine?.match(/https?:\/\/[^\s)\]]+/i)?.[0] ?? null;
  const url =
    labelledUrl ??
    lines.filter((line) => !/^source url\s*:/i.test(line)).join('\n').match(/https?:\/\/[^\s)\]]+/i)?.[0] ??
    null;

  const mode = /hybrid/i.test(text)
    ? 'hybrid'
    : /online|zoom|google meet|virtual|webinar/i.test(text)
      ? 'online'
      : venueValue
        ? 'in_person'
        : null;

  const freeForSome = /free\s+for\s+(members|students|women|college|early)/i.test(text);
  const priceLine = lines.find((line) => /^(price|ticket(?:\s+price)?|entry(?:\s+fee)?|registration\s+fee|fee|cost)\b/i.test(line)) ?? '';
  const explicitFree =
    /\bfree\s+(?:entry|admission|participation|registration|for everyone)\b/i.test(text) || /^(?:price|ticket(?:\s+price)?|entry(?:\s+fee)?|fee|cost)?\s*[:\-]?\s*free\s*$/i.test(priceLine);
  const explicitPaid =
    /[₹]\s*\d[\d,]*/.test(priceLine) || /(?:price|ticket|entry fee|registration fee|cost)\s*(?:is|of|:|-)?\s*[₹]\s*\d[\d,]*/i.test(text);
  const paidMatch = (priceLine || text).match(/[₹]\s*([\d,]+)/);

  let price;
  if (freeForSome) {
    price = { kind: 'unknown', amountInr: null, note: text.match(/free\s+for\s+[^.\n]+/i)?.[0] ?? 'Conditional price wording' };
  } else if (explicitFree) {
    price = { kind: 'free', amountInr: 0, note: 'Stated free in source' };
  } else if (explicitPaid) {
    price = {
      kind: 'paid',
      amountInr: Number(paidMatch?.[1]?.replace(/,/g, '') ?? 0) || null,
      note: 'Price extracted from explicit fee evidence',
    };
  } else {
    price = { kind: 'unknown', amountInr: null, note: '' };
  }

  const eligibility = lines.find((line) => /eligib|open to|students only|who can join/i.test(line)) ?? null;
  const skills = SKILLS.filter((skill) => text.toLowerCase().includes(skill.toLowerCase()));
  const team = text.match(/team(?:\s+size)?\s*(?:of|:)?\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);

  let eventType = null;
  for (const [type, pattern] of EVENT_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      eventType = type;
      break;
    }
  }

  const organizer =
    lines.find((line) => /^(organizer|organised by|organized by|hosted by)\s*[:-]/i.test(line))?.replace(/^[^:-]+[:-]\s*/, '') ?? null;
  const age = parseAge(text);
  const summaryType = eventType ? eventType.replace('_', ' ') : 'event';
  const summaryPlace = venueValue ? ` at ${venueValue}` : mode === 'online' ? ' online' : '';
  const city = /bengaluru|bangalore/i.test(text) ? 'Bengaluru' : null;

  const fields = {
    title: field(titleLine, titleLine ? 'high' : 'missing', titleLine ?? ''),
    eventType: field(eventType, eventType ? 'high' : 'missing'),
    organizer: field(organizer, organizer ? 'high' : 'missing', organizer ?? ''),
    startAt: field(date?.value ?? null, date?.confidence ?? 'missing', date?.evidence ?? ''),
    endAt: field(endDate?.value ?? null, endDate?.confidence ?? 'missing', endDate?.evidence ?? ''),
    registrationDeadline: field(deadline?.value ?? null, deadline?.confidence ?? 'missing', deadline?.evidence ?? ''),
    mode: field(mode, mode ? 'high' : 'missing'),
    venueName: field(venueValue, venueValue ? 'high' : 'missing', venueLine ?? ''),
    city: field(city, city ? 'high' : 'missing'),
    registrationUrl: field(url, url ? 'high' : 'missing', url ?? ''),
    price: field(price, price.kind === 'unknown' ? 'missing' : 'high', freeForSome ? 'Conditional free wording is not free for everyone' : ''),
    eligibility: field(eligibility, eligibility ? 'high' : 'missing', eligibility ?? ''),
    age,
    skills: field(skills, skills.length ? 'high' : 'missing'),
    teamSize: field(
      { min: team ? Number(team[1]) : null, max: team?.[2] ? Number(team[2]) : team ? Number(team[1]) : null },
      team ? 'high' : 'missing',
      team?.[0] ?? '',
    ),
    summary: field(
      `A ${summaryType}${summaryPlace}. Review the source details, eligibility and registration information before publishing.`,
      'high',
    ),
  };

  // Form-ready values. Anything not confidently extracted is left empty for the organiser to fill.
  const form = {
    title: titleLine ?? '',
    eventType: eventType ?? '',
    mode: mode ?? '',
    startAt: date?.value ?? null,
    endAt: endDate?.value ?? null,
    registrationDeadline: deadline?.value ?? null,
    venueName: venueValue ?? '',
    externalUrl: url ?? '',
    priceKind: price.kind,
    priceAmount: price.kind === 'paid' ? price.amountInr : null,
    minAge: age.value.minAge ?? null,
    summary: fields.summary.value,
    onlineUrl: mode === 'online' && url ? url : '',
  };

  return { fields, form };
}
