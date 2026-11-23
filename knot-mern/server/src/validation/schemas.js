import { z } from 'zod';
import { EVENT_MODES, EVENT_TYPES } from '../models/Event.js';

export const ALL_INTERESTS = [
  'ai-ml',
  'web-dev',
  'mobile',
  'data',
  'design',
  'cloud',
  'security',
  'web3',
  'startups',
  'open-source',
  'robotics',
  'career',
  'music',
  'sports',
  'arts',
  'climate',
];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const httpUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^https?:\/\/\S+$/i, 'Must be an http(s) URL');
const optionalUrl = z.union([z.literal(''), httpUrl]).nullable().optional();
const isoDateOrBlank = z.union([z.null(), z.literal(''), z.coerce.date()]).optional();
const csvOf = (values) =>
  z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(120)),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  dateOfBirth: z
    .union([z.null(), z.literal(''), z.iso.date()])
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
  role: z.enum(['participant', 'organizer']).optional().default('participant'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(1).max(72),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  dateOfBirth: z
    .union([z.null(), z.literal(''), z.iso.date()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null)),
  interests: z.array(z.enum(ALL_INTERESTS)).max(10).optional(),
  localityId: z.string().max(60).nullable().optional(),
});

const venueInput = z
  .object({
    name: z.string().trim().max(120).optional(),
    address: z.string().trim().max(240).optional(),
    localityId: z.string().max(60).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .nullable()
  .optional();

const registrationQuestion = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, 'Question keys use letters, numbers, hyphens or underscores'),
  label: z.string().trim().min(1).max(200),
  type: z.enum(['text', 'long', 'choice', 'url', 'number']).default('text'),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

const eventFields = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  mode: z.enum(EVENT_MODES).optional(),
  interests: z.array(z.enum(ALL_INTERESTS)).max(8).optional(),
  startAt: z.coerce.date().optional(),
  endAt: isoDateOrBlank,
  registrationDeadline: isoDateOrBlank,
  venue: venueInput,
  onlineUrl: optionalUrl,
  registration: z
    .object({
      type: z.enum(['native', 'external']).optional(),
      externalUrl: optionalUrl,
      capacity: z.number().int().min(1).max(100000).nullable().optional(),
      waitlistEnabled: z.boolean().optional(),
      teamMin: z.number().int().min(0).max(20).optional(),
      teamMax: z.number().int().min(0).max(20).optional(),
      questions: z.array(registrationQuestion).max(15).optional(),
      declaration: z.string().trim().max(1000).optional(),
    })
    .optional(),
  price: z
    .object({
      kind: z.enum(['free', 'paid', 'unknown']).optional(),
      amountInr: z.number().min(0).max(1000000).nullable().optional(),
    })
    .optional(),
  minAge: z.number().int().min(0).max(99).optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export const createEventSchema = eventFields.extend({
  title: z.string().trim().min(3).max(120),
  startAt: z.coerce.date(),
});

export const updateEventSchema = eventFields;

const personName = z.string().trim().min(2, 'Enter your full name').max(80);
const phoneNumber = z
  .union([z.literal(''), z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'Enter a valid phone number')])
  .optional();

/** What a participant submits to register (Unstop-style: profile, team, questions, consent). */
export const registrationSubmitSchema = z.object({
  profile: z.object({
    name: personName,
    phone: phoneNumber,
    organisation: z.string().trim().max(120).optional(),
  }),
  team: z
    .object({
      name: z.string().trim().min(2, 'Enter a team name').max(80),
      members: z
        .array(
          z.object({
            name: z.string().trim().min(2, 'Enter each member’s name').max(80),
            email: z.union([z.literal(''), z.email().max(120)]).optional(),
          }),
        )
        .max(19),
    })
    .nullable()
    .optional(),
  answers: z
    .array(
      z.object({
        key: z.string().trim().max(40),
        value: z.union([z.string().max(2000), z.number(), z.boolean()]).nullable().optional(),
      }),
    )
    .max(30)
    .optional()
    .default([]),
  consent: z.object({
    terms: z.boolean().default(false),
    dataSharing: z.boolean().optional().default(false),
  }),
});

export const reasonSchema = z.object({
  reason: z.string().trim().max(300).optional().default(''),
});

// Accepts the raw pass token or a prefixed QR payload (knot:checkin:v1:<token> or knot-pass-<token>).
export const checkInSchema = z.object({
  passToken: z
    .string()
    .trim()
    .transform((value) => value.replace(/^knot[-:](?:checkin:v1[-:]|pass[-:])/i, ''))
    .pipe(z.string().min(8).max(64)),
});

export const instantSchema = z.object({
  text: z.string().trim().min(10).max(20000),
  localityId: z.string().trim().max(60).optional().nullable(),
});

export const importLinkSchema = z.object({
  url: z.string().trim().min(8).max(2000),
  localityId: z.string().trim().max(60).optional().nullable(),
});

export const importDiscoverSchema = z.object({
  source: z.enum(['unstop', 'devfolio']),
});

export const announcementSchema = z.object({
  message: z.string().trim().min(3).max(1000),
});

export const roleSchema = z.object({
  role: z.enum(['participant', 'organizer', 'admin']),
});

export const discoverQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: csvOf(EVENT_TYPES),
  mode: csvOf(EVENT_MODES),
  interest: z.string().trim().toLowerCase().max(30).optional(),
  price: z.enum(['free', 'paid']).optional(),
  locality: z.string().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).optional().default(25),
  sort: z.enum(['date', 'distance', 'newest']).optional().default('date'),
  includePast: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

export const idParam = z.object({ id: objectId });
export const userIdParam = z.object({ userId: objectId });
export const notificationIdParam = z.object({ id: objectId });
