export const BUSINESS_TIME_ZONE = 'Asia/Riyadh';
export const BUSINESS_DAY_START_HOUR = 3;
export const BUSINESS_DAY_START_TIME = '03:00:00';

const dateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dateParts = (formatter, value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
};

export const getBusinessDate = (value = new Date()) => {
  const instant = value instanceof Date ? value : new Date(value);
  const parts = dateParts(dateFormatter, new Date(instant.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000));
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

/** Civil calendar date in Riyadh, independent of the execution day's 03:00 boundary. */
export const getSaudiCalendarDate = (value = new Date()) => {
  const parts = dateParts(dateFormatter, value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

export const getBusinessDateTimeParts = (value = new Date()) => {
  const parts = dateParts(dateTimeFormatter, value);
  return parts ? {
    date: getBusinessDate(value),
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  } : { date: '', time: '' };
};

export const shiftDateOnly = (date, days) => {
  const value = new Date(`${String(date || '')}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return '';
  value.setUTCDate(value.getUTCDate() + Number(days || 0));
  return value.toISOString().slice(0, 10);
};
