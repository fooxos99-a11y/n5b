export const emptyStudentNews = () => ({ entries: [], revision: 0 });
export const DEFAULT_NEWS_TEXT_COLOR = '#ffffff';
export function newsTimeNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function upgradeStudentNews(config = {}) {
  if (Array.isArray(config.entries)) return config;
  return { revision: Number(config.revision || 0), entries: (config.images || []).map((image, index) => ({
    id: `legacy-${index}`, title: config.title || 'الأخبار', image,
    startsAt: '', endsAt: config.expiresOn ? `${config.expiresOn}T23:59` : '',
    committeeIds: [], legacyStudentIds: config.studentIds || [], enabled: config.enabled !== false,
  })) };
}
export function visibleStudentNews(config, student, now) {
  const entries = upgradeStudentNews(config).entries.filter(entry => entry.enabled !== false
    && (!entry.startsAt || entry.startsAt <= now) && (!entry.endsAt || entry.endsAt >= now)
    && (!entry.committeeIds.length || entry.committeeIds.includes(Number(student.committeeId)))
    && (!entry.legacyStudentIds?.length || entry.legacyStudentIds.includes(Number(student.id))));
  return { entries: entries.map(({ id, title, body = '', textColor = DEFAULT_NEWS_TEXT_COLOR, image, startsAt, endsAt }) => ({ id, title, body, textColor, image, startsAt, endsAt })) };
}
