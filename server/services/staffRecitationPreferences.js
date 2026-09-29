const ALLOWED_RECITATION_MODES = new Set(['mushaf', 'count']);
const PREFERENCE_TYPES = Object.freeze(['memorization', 'mastery', 'review', 'link']);

export const normalizeRecitationMode = (value, fallback = 'mushaf') => (
  ALLOWED_RECITATION_MODES.has(value) ? value : fallback
);

const legacyPreferences = (settings = {}, role = 'supervisor') => {
  const prefix = role === 'reciter' ? 'reciter' : 'teacher';
  const memorizationMode = normalizeRecitationMode(settings[`${prefix}MemorizationRecitationMode`]);
  return {
    memorizationMode,
    masteryMode: memorizationMode,
    reviewMode: normalizeRecitationMode(settings[`${prefix}ReviewRecitationMode`]),
    linkMode: normalizeRecitationMode(settings[`${prefix}LinkRecitationMode`]),
  };
};

export const normalizeStaffRecitationPreferences = (value = {}, fallback = {}) => (
  Object.fromEntries(PREFERENCE_TYPES.map((type) => {
    const key = `${type}Mode`;
    const sourceKey = type === 'mastery' ? 'memorizationMode' : key;
    return [key, normalizeRecitationMode(value[sourceKey], normalizeRecitationMode(fallback[sourceKey]))];
  }))
);

export async function loadStaffRecitationPreferences(connection, staffId, role, settings = {}) {
  const fallback = legacyPreferences(settings, role);
  const [[row]] = await connection.query(
    `SELECT memorization_mode AS memorizationMode, mastery_mode AS masteryMode,
      review_mode AS reviewMode, link_mode AS linkMode
     FROM staff_recitation_preferences WHERE staff_id = ? LIMIT 1`,
    [staffId],
  );
  return normalizeStaffRecitationPreferences(row || {}, fallback);
}

export async function saveStaffRecitationPreferences(connection, staffId, preferences) {
  const normalized = normalizeStaffRecitationPreferences(preferences);
  await connection.query(
    `INSERT INTO staff_recitation_preferences
      (staff_id, memorization_mode, mastery_mode, review_mode, link_mode)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE memorization_mode = VALUES(memorization_mode),
       mastery_mode = VALUES(mastery_mode), review_mode = VALUES(review_mode),
       link_mode = VALUES(link_mode)`,
    [
      staffId,
      normalized.memorizationMode,
      normalized.masteryMode,
      normalized.reviewMode,
      normalized.linkMode,
    ],
  );
  return normalized;
}

export const isRecitationMode = (value) => ALLOWED_RECITATION_MODES.has(value);
