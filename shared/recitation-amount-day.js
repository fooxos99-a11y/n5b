const RECITATION_AMOUNT_DAYS = Object.freeze({
  previousDay: 'previous_day',
  sameDay: 'same_day',
});

export function normalizeRecitationAmountDay(value) {
  return value === RECITATION_AMOUNT_DAYS.sameDay
    ? RECITATION_AMOUNT_DAYS.sameDay
    : RECITATION_AMOUNT_DAYS.previousDay;
}

export function getRecitationAmountDayOffset(value) {
  return normalizeRecitationAmountDay(value) === RECITATION_AMOUNT_DAYS.sameDay ? 0 : -1;
}
