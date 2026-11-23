import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

export const REGISTRATION_STATUSES = ['confirmed', 'waitlisted', 'cancelled'];
/** Statuses that hold (or queue for) a seat. Cancelled registrations do not. */
export const ACTIVE_STATUSES = ['confirmed', 'waitlisted'];

// Snapshot of what the participant submitted, kept with the registration (not on the user profile).
const profileSnapshotSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 80, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    organisation: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false },
);

const teamSnapshotSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 80, default: '' },
    members: {
      type: [{ name: { type: String, trim: true, maxlength: 80 }, email: { type: String, trim: true, maxlength: 120, default: '' } }],
      default: [],
    },
  },
  { _id: false },
);

const answerSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 40 },
    label: { type: String, maxlength: 200, default: '' },
    value: { type: String, maxlength: 2000, default: '' },
  },
  { _id: false },
);

const consentSchema = new Schema(
  {
    terms: { type: Boolean, required: true },
    dataSharing: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
  },
  { _id: false },
);

const registrationSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'confirmed', index: true },
    // Random, unguessable token rendered as a QR pass. Never a sequential id.
    passToken: { type: String, required: true, unique: true },
    // Waitlist order is by queuedAt (re-joining the queue moves you to the back).
    queuedAt: { type: Date, default: () => new Date() },
    promotedAt: { type: Date, default: null },
    checkedInAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    // Registration form submission (see utils/registrationForm.js).
    profile: { type: profileSnapshotSchema, default: undefined },
    team: { type: teamSnapshotSchema, default: undefined },
    answers: { type: [answerSchema], default: [] },
    consent: { type: consentSchema, default: undefined },
  },
  { timestamps: true },
);

registrationSchema.index({ event: 1, user: 1 }, { unique: true });
registrationSchema.index({ event: 1, status: 1, queuedAt: 1 });
registrationSchema.index({ user: 1, status: 1 });

export const Registration = model('Registration', registrationSchema);
