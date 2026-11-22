import cron from 'node-cron';
import { Event, Registration } from '../models/index.js';
import { notifyUsers } from '../services/notifications.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const HOUR = 60 * 60 * 1000;

/** Marks published events as ended once their end time (or start + 6h when no end is set) has passed. */
export async function closeEndedEvents(now = new Date()) {
  const res = await Event.updateMany(
    {
      status: 'published',
      $or: [{ endAt: { $lt: now } }, { endAt: null, startAt: { $lt: new Date(now.getTime() - 6 * HOUR) } }],
    },
    { status: 'ended' },
  );
  return res.modifiedCount;
}

/** Sends a single "starts within 24 hours" reminder to each confirmed attendee. */
export async function sendStartReminders(now = new Date()) {
  const events = await Event.find(
    { status: 'published', startAt: { $gt: now, $lte: new Date(now.getTime() + 24 * HOUR) } },
    { title: 1 },
  ).lean();
  let sent = 0;
  for (const event of events) {
    const regs = await Registration.find({
      event: event._id,
      status: 'confirmed',
      reminderSentAt: null,
    }).lean();
    if (regs.length === 0) continue;
    await notifyUsers(regs.map((r) => r.user), {
      type: 'reminder',
      title: `Starts within 24 hours: ${event.title}`,
      body: 'Have your QR pass ready for check-in.',
      link: `/events/${event._id}`,
    });
    await Registration.updateMany({ _id: { $in: regs.map((r) => r._id) } }, { reminderSentAt: now });
    sent += regs.length;
  }
  return sent;
}

export async function runJobs(now = new Date()) {
  const ended = await closeEndedEvents(now);
  const reminders = await sendStartReminders(now);
  return { ended, reminders };
}

export function startJobs(expression = env.JOB_CRON) {
  if (!cron.validate(expression)) throw new Error(`Invalid JOB_CRON expression: ${expression}`);
  return cron.schedule(expression, async () => {
    try {
      const result = await runJobs();
      if (result.ended || result.reminders) logger.info(result, 'Scheduled jobs completed');
    } catch (err) {
      logger.error({ err }, 'Scheduled job failed');
    }
  });
}
