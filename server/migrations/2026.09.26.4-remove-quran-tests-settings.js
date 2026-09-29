import { PLATFORM_POLICY_PREFIX } from '../../shared/platform-settings-catalog.js';

export const version = '2026.09.26.4';

// The standalone Quran tests feature was removed; the track session is now the test.
export const REMOVED_SETTING_KEYS = Object.freeze([
  'quranTestsSectionEnabled',
  'quranTestMessageTemplate',
  'quranTestMaxScore',
  'quranTestWarningDeduction',
  'quranTestMistakeDeduction',
  'quranTestRetestScore',
  'quranTestPassingScore',
]);

export async function up(connection) {
  const keys = REMOVED_SETTING_KEYS.flatMap((key) => [key, `${PLATFORM_POLICY_PREFIX}${key}`]);
  await connection.query(`DELETE FROM app_settings WHERE setting_key IN (${keys.map(() => '?').join(', ')})`, keys);
}
