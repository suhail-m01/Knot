import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

export const NOTIFICATION_TYPES = ['registration', 'promotion', 'announcement', 'reminder', 'system', 'change'];

const notificationSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 1000 },
    link: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });

export const Notification = model('Notification', notificationSchema);
