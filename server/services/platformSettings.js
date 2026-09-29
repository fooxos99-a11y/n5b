import { db, initDatabase, runWithDatabase } from '../db.js';
import {
  PLATFORM_POLICY_VALUES,
  platformSettingsCatalog,
  platformSettingsByKey,
} from '../../shared/platform-settings-catalog.js';
import {
  applyPlatformPolicies,
  platformPolicyEntries,
  readPlatformPoliciesFromRows,
} from './platformSettingPolicies.js';
import { enforcePointsFeatureDependencies } from '../../shared/points-feature-settings.js';
import { normalizeTeacherPointTypes } from '../../shared/teacher-point-types.js';

const allowedKeys = new Set(platformSettingsCatalog.map(({ key }) => key));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const parseArray = (value, fallback) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeSettingValue = (definition, value) => {
  const fallback = definition.defaultValue;
  if (definition.type === 'boolean') return value === true || value === 'true';
  if (definition.type === 'number') {
    const parsed = Number(value ?? fallback);
    const finite = Number.isFinite(parsed) ? parsed : Number(fallback || 0);
    return Math.min(definition.max ?? Number.POSITIVE_INFINITY, Math.max(definition.min ?? 0, finite));
  }
  if (definition.type === 'weekDays') {
    return [...new Set(parseArray(value, fallback).map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      .sort((left, right) => left - right);
  }
  if (definition.type === 'taskTypes') {
    const allowed = new Set(['memorization', 'review', 'link', 'repeat']);
    return [...new Set(parseArray(value, fallback).map(String).filter((item) => allowed.has(item)))];
  }
  if (definition.type === 'teacherPointTypes') return normalizeTeacherPointTypes(value);
  if (definition.type === 'select') {
    return definition.options.some((option) => option.value === value) ? value : fallback;
  }
  if (definition.type === 'date') return datePattern.test(String(value || '')) ? String(value) : '';
  return String(value ?? fallback ?? '');
};

const normalizeSettings = (raw = {}) => Object.fromEntries(
  platformSettingsCatalog.map((definition) => [
    definition.key,
    normalizeSettingValue(definition, raw[definition.key] ?? definition.defaultValue),
  ]),
);

const serializeSettingValue = (key, value) => {
  const type = platformSettingsByKey.get(key)?.type;
  if (type === 'weekDays' || type === 'taskTypes' || type === 'teacherPointTypes') return JSON.stringify(value);
  if (type === 'boolean') return String(Boolean(value));
  return String(value ?? '');
};

const validateSettings = (value) => {
  if (Boolean(value.quranPlanStartDate) !== Boolean(value.quranPlanEndDate)) {
    const error = new Error('أدخل البداية والنهاية معًا.');
    error.status = 422;
    throw error;
  }
  if (value.quranPlanStartDate && value.quranPlanStartDate > value.quranPlanEndDate) {
    const error = new Error('النهاية يجب أن تكون بعد البداية.');
    error.status = 422;
    throw error;
  }
  if (!value.attendanceManualEnabled && !value.attendanceAccountEnabled) {
    const error = new Error('فعّل طريقة حضور واحدة على الأقل.');
    error.status = 422;
    throw error;
  }
  if (!value.recitationSessionDays.length) {
    const error = new Error('اختر يوم تسميع واحدًا على الأقل.');
    error.status = 422;
    throw error;
  }
};

const withTenant = async (complex, callback) => {
  if (!complex?.databaseName) return { available: false, errorCode: 'TENANT_SETTINGS_UNAVAILABLE' };
  try {
    await initDatabase(complex.databaseName);
    return await runWithDatabase(complex.databaseName, { tenant: complex }, callback);
  } catch (error) {
    if (error?.status) throw error;
    return { available: false, errorCode: 'TENANT_SETTINGS_UNAVAILABLE' };
  }
};

const readCurrentSettings = async () => {
  const [rows] = await db().query(
    'SELECT setting_key AS settingKey, setting_value AS settingValue FROM app_settings',
  );
  const raw = Object.fromEntries(rows
    .filter((row) => allowedKeys.has(row.settingKey))
    .map((row) => [row.settingKey, row.settingValue]));
  const policies = readPlatformPoliciesFromRows(rows);
  const settings = enforcePointsFeatureDependencies(applyPlatformPolicies(normalizeSettings(raw), policies));
  return { settings, policies };
};

export const readComplexPlatformSettings = async (complex) => withTenant(complex, async () => ({
  available: true,
  ...(await readCurrentSettings()),
}));

export const writeComplexPlatformSettings = async (complex, input = {}) => withTenant(complex, async () => {
  const current = await readCurrentSettings();
  const patch = Object.fromEntries(Object.entries(input.settings || input)
    .filter(([key]) => allowedKeys.has(key)));
  const policies = Object.fromEntries(platformSettingsCatalog.map(({ key }) => [
    key,
    Object.values(PLATFORM_POLICY_VALUES).includes(input.policies?.[key])
      ? input.policies[key]
      : current.policies[key],
  ]));
  let settings = applyPlatformPolicies(normalizeSettings({ ...current.settings, ...patch }), policies);

  settings = enforcePointsFeatureDependencies(settings);
  validateSettings(settings);

  const settingEntries = platformSettingsCatalog
    .filter(({ key }) => policies[key] !== PLATFORM_POLICY_VALUES.tenant)
    .map(({ key }) => [key, serializeSettingValue(key, settings[key])]);
  const entries = [...settingEntries, ...platformPolicyEntries(policies)];
  await db().query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ${entries.map(() => '(?, ?)').join(', ')}
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    entries.flat(),
  );
  settings = applyPlatformPolicies(settings, policies);
  return { available: true, settings, policies };
});

export const platformSettingsDefaults = Object.freeze(Object.fromEntries(
  platformSettingsCatalog.map(({ key, defaultValue }) => [key, defaultValue]),
));
