import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Source-linked hackathon records written by the harvester. Knot never registers people on the
// official site; the record only carries the handoff link and what the source said.
const hackathonListingSchema = new Schema(
  {
    externalId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: null, maxlength: 4000 },
    organizer: { type: String, default: null, maxlength: 200 },
    mode: { type: String, enum: ['online', 'offline', 'hybrid'], required: true },
    city: { type: String, default: null },
    area: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: null },
    venue: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    locationPrecision: { type: String, enum: ['exact', 'approximate', 'city', 'none'], default: 'none' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    registrationDeadline: { type: Date, default: null },
    timezone: { type: String, default: null },
    startTimeKnown: { type: Boolean, default: true },
    endTimeKnown: { type: Boolean, default: true },
    isFree: { type: Boolean, default: null },
    priceAmount: { type: Number, default: null },
    currency: { type: String, default: null },
    prizePool: { type: String, default: null },
    tags: { type: [String], default: [] },
    eligibility: { type: String, default: null },
    teamSize: { type: String, default: null },
    imageUrl: { type: String, default: null },
    officialUrl: { type: String, required: true },
    officialUrlVerified: { type: Boolean, default: false },
    sourceUrl: { type: String, required: true },
    sourcePlatform: { type: String, required: true },
    lastCheckedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

hackathonListingSchema.index({ startDate: 1 });

export const HackathonListing = model('HackathonListing', hackathonListingSchema);

const hackathonInterestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hackathonId: { type: String, required: true },
    context: { type: String, enum: ['web', 'home', 'my_interests'], default: 'web' },
  },
  { timestamps: true },
);
hackathonInterestSchema.index({ userId: 1, hackathonId: 1 }, { unique: true });

export const HackathonInterest = model('HackathonInterest', hackathonInterestSchema);
