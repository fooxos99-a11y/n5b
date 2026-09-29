export const OFFLINE_RECITATION_DB_VERSION = 2;
export const OFFLINE_RECITATION_CACHE_DAYS = 14;
export const OFFLINE_RECITATION_MAX_BATCH = 100;

const RECITATION_SYNC_STATUSES = Object.freeze([
  'draft',
  'pending',
  'syncing',
  'synced',
  'rejected_duplicate',
  'rejected_permission',
  'invalid_sequence',
  'failed',
  'conflict',
]);

export const isUuid = (value) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
);

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

export const normalizeRecitationSessionType = (value) => {
  const raw = String(value || '');
  if (/^(memorization|mastery|review|link):compensation:[1-9]\d{0,2}$/.test(raw)) return raw;
  return ['memorization', 'mastery', 'review', 'link'].includes(raw) ? raw : 'general';
};

export const recitationSessionTypeForTask = (task = {}) => {
  const baseType = normalizeRecitationSessionType(
    task.taskType === 'memorization' && task.track === 'mastery' ? 'mastery' : task.taskType,
  );
  // Each compensation is its own recitation of the day, beside the regular one.
  const compensationIndex = Math.trunc(Number(task.compensationIndex || 0));
  return compensationIndex > 0 && compensationIndex < 1000 && ['memorization', 'mastery', 'review', 'link'].includes(baseType)
    ? `${baseType}:compensation:${compensationIndex}`
    : baseType;
};

export const recitationSessionKey = ({ studentId, sessionDate, sessionType }) => (
  `${Number(studentId)}:${String(sessionDate || '')}:${normalizeRecitationSessionType(sessionType)}`
);

export const compareRecitationSessions = (first, second) => (
  `${String(first?.sessionDate || '')}:${String(first?.committedAtLocal || first?.createdAtLocal || '')}:${String(first?.sessionId || '')}`
    .localeCompare(`${String(second?.sessionDate || '')}:${String(second?.committedAtLocal || second?.createdAtLocal || '')}:${String(second?.sessionId || '')}`)
);

export const canEditPendingRecitation = (status) => (
  ['pending', 'failed', 'invalid_sequence', 'conflict'].includes(String(status || ''))
);

export const recitationCandidateWins = (candidate, current) => {
  if (Boolean(candidate?.trusted) !== Boolean(current?.trusted)) return Boolean(candidate?.trusted);
  if (candidate?.trusted && candidate.eventAt !== current?.eventAt) return candidate.eventAt < current.eventAt;
  return String(candidate?.sessionId || '').localeCompare(String(current?.sessionId || '')) < 0;
};

export const createUuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const normalizeRecitationSession = (value = {}) => ({
  sessionId: isUuid(value.sessionId) ? value.sessionId.toLowerCase() : '',
  studentId: Math.max(0, Number(value.studentId || 0)),
  supervisorId: Math.max(0, Number(value.supervisorId || 0)),
  deviceId: isUuid(value.deviceId) ? value.deviceId.toLowerCase() : '',
  registrationNumber: String(value.registrationNumber || '').trim().slice(0, 120),
  sessionDate: isDateOnly(value.sessionDate) ? value.sessionDate : '',
  sessionType: normalizeRecitationSessionType(value.sessionType),
  status: RECITATION_SYNC_STATUSES.includes(value.status) ? value.status : 'draft',
  createdAtLocal: String(value.createdAtLocal || ''),
  updatedAtLocal: String(value.updatedAtLocal || value.createdAtLocal || ''),
  committedAtLocal: String(value.committedAtLocal || ''),
  eventMonotonicMs: Number.isFinite(Number(value.eventMonotonicMs)) ? Number(value.eventMonotonicMs) : null,
  bootId: isUuid(value.bootId) ? value.bootId.toLowerCase() : '',
  retryCount: Math.max(0, Math.trunc(Number(value.retryCount || 0))),
  tasks: Array.isArray(value.tasks) ? value.tasks : [],
});
