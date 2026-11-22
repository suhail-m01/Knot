// Seeds Bengaluru localities, demo accounts and realistic upcoming events.
// Usage: npm run seed            (adds demo data if the database is empty)
//        npm run seed:reset      (drops Knot collections first)
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Announcement, Event, Locality, Notification, Registration, User } from '../models/index.js';
import { newPassToken } from '../utils/tokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const localities = JSON.parse(fs.readFileSync(path.join(here, 'localities.json'), 'utf8'));

export const DEMO_ACCOUNTS = [
  { name: 'Knot Admin', email: 'admin@knot.local', password: 'Admin@12345', role: 'admin' },
  { name: 'Asha Organizer', email: 'organizer@knot.local', password: 'Organizer@123', role: 'organizer' },
  { name: 'Ravi Community', email: 'community@knot.local', password: 'Community@123', role: 'organizer' },
  { name: 'Meera Participant', email: 'participant@knot.local', password: 'Participant@123', role: 'participant' },
  { name: 'Arjun Student', email: 'student@knot.local', password: 'Student@12345', role: 'participant' },
];

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function localityById(id) {
  const found = localities.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown locality ${id}`);
  return found;
}

/** Venue coordinates are the locality centre with a small offset, flagged as approximate in the copy. */
function venueFor(localityId, name, address, nudge = 0) {
  const l = localityById(localityId);
  return {
    name,
    address,
    localityId,
    lat: Number((l.latitude + nudge * 0.002).toFixed(6)),
    lng: Number((l.longitude - nudge * 0.002).toFixed(6)),
  };
}

function eventTemplates(now, organizers) {
  const at = (days, hour, minute = 0) => {
    const d = new Date(now.getTime() + days * DAY);
    // IST is UTC+05:30. Compute the instant that is `hour`:`minute` in India on that calendar day.
    const ist = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - 5, minute - 30));
    return ist;
  };
  const [asha, ravi] = organizers;

  return [
    {
      title: 'Bengaluru AI Builders Night',
      summary: 'Lightning demos of small LLM apps, followed by a hands-on evaluation clinic.',
      description:
        'Bring a laptop. We will demo five small LLM apps built by members, then split into pairs to evaluate prompts with a shared test set. Pizza and chai provided.',
      eventType: 'meetup',
      mode: 'in_person',
      interests: ['ai-ml', 'open-source'],
      organizer: asha,
      startAt: at(2, 18, 30),
      endAt: at(2, 21, 0),
      venue: venueFor('koramangala', 'Startup Hub Koramangala', '5th Block, Koramangala', 1),
      registration: { type: 'native', capacity: 40, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Full-Stack MERN Workshop: Build a Real-Time Board',
      summary: 'Build a collaborative board with React, Express, MongoDB and Socket.IO in three hours.',
      description: 'A guided, hands-on workshop. Node 20+, npm and a MongoDB instance (Docker is fine) required.',
      eventType: 'workshop',
      mode: 'in_person',
      interests: ['web-dev', 'data'],
      organizer: asha,
      startAt: at(4, 10, 0),
      endAt: at(4, 13, 0),
      venue: venueFor('indiranagar', 'Makerspace Indiranagar', '100 Feet Road', -1),
      registration: { type: 'native', capacity: 2, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 16,
    },
    {
      title: 'Hack Whitefield 48h',
      summary: 'A 48-hour weekend hackathon for students and early-career builders.',
      description: 'Teams of 2–4. Prizes for best use of open data and for community impact. Meals included.',
      eventType: 'hackathon',
      mode: 'hybrid',
      interests: ['ai-ml', 'startups', 'climate'],
      organizer: ravi,
      startAt: at(9, 9, 0),
      endAt: at(11, 9, 0),
      venue: venueFor('whitefield', 'Tech Park Campus Whitefield', 'ITPL Main Road', 2),
      onlineUrl: 'https://example.org/hack-whitefield-stream',
      registration: { type: 'native', capacity: 120, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 18,
    },
    {
      title: 'HSR Cloud Native Meetup',
      summary: 'Kubernetes cost hygiene and observability war stories from local SRE teams.',
      description: 'Three talks, lightning Q&A, networking.',
      eventType: 'meetup',
      mode: 'in_person',
      interests: ['cloud', 'security'],
      organizer: ravi,
      startAt: at(6, 18, 0),
      endAt: at(6, 20, 30),
      venue: venueFor('hsr-layout', 'Co-working HSR Sector 2', '27th Main, HSR Layout', 0),
      registration: { type: 'native', capacity: 60, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Design Systems Sprint for Indie Makers',
      summary: 'A one-day sprint to ship a themeable component library in React.',
      description: 'Bring a product idea and leave with tokens, components and a Storybook.',
      eventType: 'workshop',
      mode: 'in_person',
      interests: ['design', 'web-dev'],
      organizer: asha,
      startAt: at(13, 10, 0),
      endAt: at(13, 17, 0),
      venue: venueFor('jayanagar', 'Studio Jayanagar 4th Block', '4th Block, Jayanagar', 1),
      registration: { type: 'native', capacity: 1, waitlistEnabled: true },
      price: { kind: 'paid', amountInr: 499 },
      minAge: 0,
    },
    {
      title: 'Women in Data Science: Career Panel',
      summary: 'Four data leaders on roles, portfolios and getting hired in Bengaluru.',
      description: 'Panel plus open mentoring tables. Free entry, registration required.',
      eventType: 'community_session',
      mode: 'in_person',
      interests: ['data', 'career'],
      organizer: ravi,
      startAt: at(16, 17, 30),
      endAt: at(16, 19, 30),
      venue: venueFor('marathahalli', 'Marathahalli Community Hall', 'Outer Ring Road', -2),
      registration: { type: 'native', capacity: 80, waitlistEnabled: false },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Web3 Security Teardown (Online)',
      summary: 'Walk through three real smart-contract incidents and how they could have been caught.',
      description: 'Live online session with code walkthroughs.',
      eventType: 'webinar',
      mode: 'online',
      interests: ['web3', 'security'],
      organizer: asha,
      startAt: at(3, 20, 0),
      endAt: at(3, 21, 30),
      venue: null,
      onlineUrl: 'https://example.org/web3-teardown',
      registration: { type: 'external', externalUrl: 'https://example.org/register/web3-teardown', capacity: null, waitlistEnabled: false },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Open Source Saturday: Good First Issues',
      summary: 'Pair up with maintainers and land your first merged pull request.',
      description: 'We will triage issues, set up dev environments and review PRs together.',
      eventType: 'community_session',
      mode: 'in_person',
      interests: ['open-source', 'web-dev'],
      organizer: ravi,
      startAt: at(5, 11, 0),
      endAt: at(5, 15, 0),
      venue: venueFor('electronic-city', 'Electronic City Tech Commons', 'Phase 1, Electronic City', 0),
      registration: { type: 'native', capacity: 25, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Robotics Build Night for Teens',
      summary: 'Build a line-following robot with mentors. Parents welcome to watch the demo.',
      description: 'Supervised session. Guardian consent is recorded on the registration form at the venue.',
      eventType: 'workshop',
      mode: 'in_person',
      interests: ['robotics'],
      organizer: asha,
      startAt: at(8, 16, 0),
      endAt: at(8, 18, 0),
      venue: venueFor('malleshwaram', 'Malleshwaram Science Lab', '8th Cross, Malleshwaram', 0),
      registration: { type: 'native', capacity: 12, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 13,
    },
    {
      title: 'Startup Pitch Friday at Bellandur',
      summary: 'Five early-stage founders pitch; investors and operators give feedback.',
      description: 'Pitches are 5 minutes, feedback 3 minutes.',
      eventType: 'conference',
      mode: 'in_person',
      interests: ['startups', 'career'],
      organizer: ravi,
      startAt: at(-3, 18, 0),
      endAt: at(-3, 21, 0),
      venue: venueFor('bellandur', 'Bellandur Founders Club', 'Outer Ring Road, Bellandur', 1),
      registration: { type: 'native', capacity: 100, waitlistEnabled: true },
      price: { kind: 'free', amountInr: 0 },
      minAge: 0,
    },
    {
      title: 'Robotics Showcase Bengaluru 2026',
      summary: 'Student robotics teams show their builds to judges from industry.',
      description: 'Public showcase with judged rounds.',
      eventType: 'competition',
      mode: 'in_person',
      interests: ['robotics', 'arts'],
      organizer: asha,
      startAt: at(20, 10, 0),
      endAt: at(20, 16, 0),
      venue: venueFor('hebbal', 'Hebbal Exhibition Grounds', 'Hebbal Flyover', 1),
      registration: { type: 'native', capacity: null, waitlistEnabled: false },
      price: { kind: 'unknown', amountInr: null },
      minAge: 0,
    },
  ];
}

export async function seedDatabase({ reset = false, log = logger } = {}) {
  if (reset) {
    await Promise.all([
      User.deleteMany({}),
      Event.deleteMany({}),
      Registration.deleteMany({}),
      Notification.deleteMany({}),
      Announcement.deleteMany({}),
    ]);
    log.info('Reset Knot collections');
  }

  await Locality.bulkWrite(
    localities.map((l) => ({
      updateOne: {
        filter: { _id: l.id },
        update: {
          $set: {
            name: l.name,
            aliases: l.aliases ?? [],
            city: l.city,
            country: l.country,
            lat: l.latitude,
            lng: l.longitude,
          },
        },
        upsert: true,
      },
    })),
  );

  const userCount = await User.countDocuments();
  if (userCount > 0 && !reset) {
    log.info({ users: userCount }, 'Database already has users. Skipping demo data.');
    return { seeded: false };
  }

  const createdUsers = [];
  for (const account of DEMO_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await User.create({
      name: account.name,
      email: account.email,
      passwordHash,
      role: account.role,
      dateOfBirth: account.role === 'participant' ? new Date('2001-06-15T00:00:00.000Z') : null,
      interests: account.role === 'participant' ? ['ai-ml', 'web-dev', 'open-source'] : [],
      localityId: 'koramangala',
    });
    createdUsers.push(user);
  }
  const organizers = createdUsers.filter((u) => u.role === 'organizer');
  const participants = createdUsers.filter((u) => u.role === 'participant');

  const now = new Date();
  const events = [];
  for (const template of eventTemplates(now, organizers)) {
    const { organizer, venue, ...rest } = template;
    const doc = new Event({
      ...rest,
      organizer: organizer._id,
      organizerName: organizer.name,
      venue: venue ?? undefined,
      status: 'published',
    });
    await doc.save();
    events.push(doc);
  }

  // A few confirmed registrations and one waitlist so the demo shows real state.
  const [meera, arjun] = participants;
  const seedRegistration = async (event, user, status) => {
    await Registration.create({ event: event._id, user: user._id, status, passToken: newPassToken(), queuedAt: now });
    const field = status === 'confirmed' ? 'registeredCount' : 'waitlistCount';
    await Event.updateOne({ _id: event._id }, { $inc: { [field]: 1 } });
  };
  const workshop = events[1];
  const design = events[4];
  if (meera) await seedRegistration(workshop, meera, 'confirmed');
  if (arjun) await seedRegistration(workshop, arjun, 'waitlisted');
  if (meera) await seedRegistration(events[0], meera, 'confirmed');
  if (arjun) await seedRegistration(design, arjun, 'confirmed');
  if (meera) await seedRegistration(design, meera, 'waitlisted');

  if (meera) await User.updateOne({ _id: meera._id }, { $addToSet: { savedEvents: { $each: [events[2]._id, events[3]._id] } } });

  log.info({ users: createdUsers.length, events: events.length, localities: localities.length }, 'Seed complete');
  return { seeded: true, users: createdUsers.length, events: events.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      await connectDb(env.MONGODB_URI);
      await seedDatabase({ reset: process.argv.includes('--reset') });
    } catch (err) {
      logger.error({ err }, 'Seeding failed');
      process.exitCode = 1;
    } finally {
      await disconnectDb();
    }
  })();
}
