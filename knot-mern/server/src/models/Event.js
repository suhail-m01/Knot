import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

export const EVENT_TYPES = [
  'hackathon',
  'workshop',
  'meetup',
  'conference',
  'competition',
  'webinar',
  'community_session',
  'other',
];
export const EVENT_MODES = ['in_person', 'online', 'hybrid'];
export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'ended'];

const venueSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    address: { type: String, trim: true, maxlength: 240, default: '' },
    localityId: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false },
);

export const QUESTION_TYPES = ['text', 'long', 'choice', 'url', 'number'];

// One organizer question on the registration form (Unstop-style custom questions).
const questionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: QUESTION_TYPES, default: 'text' },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
  },
  { _id: false },
);

const registrationSchema = new Schema(
  {
    // native = Knot seats/waitlist; external = handoff to the organizer's own site.
    type: { type: String, enum: ['native', 'external'], default: 'native' },
    externalUrl: { type: String, default: null },
    capacity: { type: Number, default: null, min: 1 },
    waitlistEnabled: { type: Boolean, default: true },
    // Team size including the registrant. 0 means individual registration.
    teamMin: { type: Number, default: 0, min: 0, max: 20 },
    teamMax: { type: Number, default: 0, min: 0, max: 20 },
    questions: { type: [questionSchema], default: [] },
    declaration: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const priceSchema = new Schema(
  {
    kind: { type: String, enum: ['free', 'paid', 'unknown'], default: 'free' },
    amountInr: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    summary: { type: String, trim: true, maxlength: 300, default: '' },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    eventType: { type: String, enum: EVENT_TYPES, default: 'meetup' },
    mode: { type: String, enum: EVENT_MODES, default: 'in_person' },
    interests: { type: [String], default: [] },

    organizer: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    organizerName: { type: String, required: true, trim: true, maxlength: 80 },

    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    timezone: { type: String, default: 'Asia/Kolkata' },
    registrationDeadline: { type: Date, default: null },

    venue: { type: venueSchema, default: undefined },
    onlineUrl: { type: String, default: null },

    registration: { type: registrationSchema, default: () => ({}) },
    price: { type: priceSchema, default: () => ({}) },
    minAge: { type: Number, default: 0, min: 0, max: 99 },

    status: { type: String, enum: EVENT_STATUSES, default: 'published' },
    cancelledReason: { type: String, default: null },

    // Denormalised counters, kept in step with Registration documents by the registration service.
    registeredCount: { type: Number, default: 0, min: 0 },
    waitlistCount: { type: Number, default: 0, min: 0 },
    checkedInCount: { type: Number, default: 0, min: 0 },
    externalHandoffs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

eventSchema.index({ status: 1, startAt: 1 });
eventSchema.index({ 'venue.lat': 1, 'venue.lng': 1 });
eventSchema.index({ 'venue.localityId': 1, startAt: 1 });
eventSchema.index({ interests: 1, startAt: 1 });

export const Event = model('Event', eventSchema);
