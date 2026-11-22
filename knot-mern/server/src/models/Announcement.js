import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

// A message an organizer broadcast to an event's attendees. Each recipient also gets a Notification.
const announcementSchema = new Schema(
  {
    event: { type: Types.ObjectId, ref: 'Event', required: true, index: true },
    author: { type: Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    recipients: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Announcement = model('Announcement', announcementSchema);
