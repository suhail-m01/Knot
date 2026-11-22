const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Finds overlapping time ranges among planned events.
 * Items: { id, title, startAt, endAt? }. Events without endAt are assumed to last two hours.
 * Returns pairs with the overlap length in minutes. Touching end/start times do not conflict.
 */
export function findScheduleConflicts(items) {
  const ranges = items
    .map((item) => {
      const start = new Date(item.startAt).getTime();
      const end = item.endAt ? new Date(item.endAt).getTime() : start + DEFAULT_DURATION_MS;
      return { ...item, start, end: Math.max(end, start) };
    })
    .sort((a, b) => a.start - b.start);

  const conflicts = [];
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i];
      const b = ranges[j];
      if (b.start >= a.end) break; // sorted by start: nothing later can overlap a
      const overlapMs = Math.min(a.end, b.end) - b.start;
      if (overlapMs > 0) {
        conflicts.push({
          first: { id: a.id, title: a.title },
          second: { id: b.id, title: b.title },
          overlapMinutes: Math.round(overlapMs / 60000),
        });
      }
    }
  }
  return conflicts;
}
