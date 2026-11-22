import { Notification } from '../models/index.js';
import { serializeNotification } from '../utils/serialize.js';
import { emitToUser } from '../realtime/socket.js';

/**
 * Persists an in-app notification for each user and pushes it live over Socket.IO.
 * "Sent" here means in-app delivery only. The app does not send email or SMS.
 */
export async function notifyUsers(userIds, { type, title, body = '', link = '' }) {
  const ids = [...new Set(userIds.map((id) => String(id)))];
  if (ids.length === 0) return [];
  const docs = await Notification.insertMany(ids.map((user) => ({ user, type, title, body, link })));
  for (const doc of docs) {
    emitToUser(String(doc.user), 'notification', serializeNotification(doc));
  }
  return docs;
}

export async function listNotifications(userId, limit = 50) {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { items: items.map(serializeNotification), unreadCount };
}

export async function markRead(userId, notificationId) {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { readAt: new Date() },
    { returnDocument: 'after' },
  ).lean();
  return doc ? serializeNotification(doc) : null;
}

export async function markAllRead(userId) {
  const res = await Notification.updateMany({ user: userId, readAt: null }, { readAt: new Date() });
  return res.modifiedCount;
}
