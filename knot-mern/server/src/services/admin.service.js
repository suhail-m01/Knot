import { Event, Registration, User } from '../models/index.js';
import { escapeRegex } from '../utils/text.js';
import { serializeUser } from '../utils/serialize.js';
import { notFound } from '../utils/errors.js';

export async function listUsers({ q, limit = 200 } = {}) {
  const filter = q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }] } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return users.map((u) => serializeUser(u));
}

export async function setRole(userId, role, actor) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  if (String(user._id) === String(actor._id) && role !== 'admin') {
    throw notFound('You cannot remove your own admin role.');
  }
  user.role = role;
  await user.save();
  return serializeUser(user);
}

export async function platformStats() {
  const [users, roleCounts, eventsByStatus, registrations, checkedIn] = await Promise.all([
    User.countDocuments(),
    Promise.all(['participant', 'organizer', 'admin'].map(async (role) => [role, await User.countDocuments({ role })])),
    Promise.all(
      ['draft', 'published', 'cancelled', 'ended'].map(async (status) => [status, await Event.countDocuments({ status })]),
    ),
    Registration.countDocuments({ status: 'confirmed' }),
    Registration.countDocuments({ checkedInAt: { $ne: null } }),
  ]);
  return {
    users,
    usersByRole: Object.fromEntries(roleCounts),
    eventsByStatus: Object.fromEntries(eventsByStatus),
    confirmedRegistrations: registrations,
    checkedIn,
  };
}
