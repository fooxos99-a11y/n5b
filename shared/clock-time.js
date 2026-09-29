export function formatClockTime(value) {
  if (!value) return '-';
  const match = /(?:^|[T ])(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(value));
  if (!match) return String(value);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '-';
  const minutes = minute ? ':' + match[2] : '';
  return `${hour % 12 || 12}${minutes}${hour < 12 ? 'ص' : 'م'}`;
}
