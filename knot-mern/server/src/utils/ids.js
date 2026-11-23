import { notFound } from './errors.js';
import { isObjectIdString } from './text.js';

/** Throws 404 for malformed ids so that no database query runs with a bad identifier. */
export function parseEventId(id) {
  if (!isObjectIdString(id)) throw notFound('Event not found');
  return id;
}
