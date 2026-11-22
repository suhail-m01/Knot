import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

export const ROLES = ['participant', 'organizer', 'admin'];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'participant', index: true },
    // Used for minimum-age checks. Unknown stays unknown: age-gated events ask for it.
    dateOfBirth: { type: Date, default: null },
    interests: { type: [String], default: [] },
    localityId: { type: String, default: null },
    following: { type: [Types.ObjectId], ref: 'User', default: [] },
    savedEvents: { type: [Types.ObjectId], ref: 'Event', default: [] },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
