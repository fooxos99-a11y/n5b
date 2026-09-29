export const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export function getDatesInRange(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const dates = [];
  for (let cursor = start; cursor <= end; cursor += UTC_DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}
