export const EVENT_TYPES = [
  ['meetup', 'Meetup'],
  ['workshop', 'Workshop'],
  ['hackathon', 'Hackathon'],
  ['conference', 'Conference'],
  ['competition', 'Competition'],
  ['webinar', 'Webinar'],
  ['community_session', 'Community session'],
  ['other', 'Other'],
];

export const MODES = [
  ['in_person', 'In person'],
  ['online', 'Online'],
  ['hybrid', 'Hybrid'],
];

export const INTERESTS = [
  ['ai-ml', 'AI & ML'],
  ['web-dev', 'Web development'],
  ['mobile', 'Mobile'],
  ['data', 'Data'],
  ['design', 'Design'],
  ['cloud', 'Cloud'],
  ['security', 'Security'],
  ['web3', 'Web3'],
  ['startups', 'Startups'],
  ['open-source', 'Open source'],
  ['robotics', 'Robotics'],
  ['career', 'Career'],
  ['music', 'Music'],
  ['sports', 'Sports'],
  ['arts', 'Arts'],
  ['climate', 'Climate'],
];

export const RADIUS_OPTIONS = [3, 5, 10, 25, 50];

export const SORT_OPTIONS = [
  ['date', 'Soonest first'],
  ['distance', 'Nearest first'],
  ['newest', 'Recently added'],
];

export const ROLE_LABELS = { participant: 'Participant', organizer: 'Organizer', admin: 'Admin' };

export const STATUS_LABELS = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  published: 'Published',
  ended: 'Ended',
};

export const labelOf = (list, value) => list.find(([v]) => v === value)?.[1] ?? value;

/** Bengaluru city centre, used when no locality or device location is chosen. */
export const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946, name: 'Bengaluru' };
