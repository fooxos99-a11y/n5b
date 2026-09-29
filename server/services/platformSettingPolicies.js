import {
  PLATFORM_POLICY_PREFIX,
  PLATFORM_POLICY_VALUES,
  platformSettingsCatalog,
  platformSettingsByKey,
} from '../../shared/platform-settings-catalog.js';

const validPolicies = new Set(Object.values(PLATFORM_POLICY_VALUES));

const normalizePlatformPolicy = (value) => (
  validPolicies.has(value) ? value : PLATFORM_POLICY_VALUES.tenant
);

export const readPlatformPoliciesFromRows = (rows = []) => Object.fromEntries(
  platformSettingsCatalog.map(({ key }) => {
    const row = rows.find((item) => (item.setting_key || item.settingKey) === `${PLATFORM_POLICY_PREFIX}${key}`);
    return [key, normalizePlatformPolicy(row?.setting_value ?? row?.settingValue)];
  }),
);

export const applyPlatformPolicies = (settings, policies) => {
  const effective = { ...settings };
  Object.entries(policies || {}).forEach(([key, policy]) => {
    const definition = platformSettingsByKey.get(key);
    if (!definition || policy === PLATFORM_POLICY_VALUES.tenant) return;
    if (definition.type === 'boolean') {
      effective[key] = policy === PLATFORM_POLICY_VALUES.enabled;
    } else if (policy === PLATFORM_POLICY_VALUES.disabled) {
      effective[key] = definition.defaultValue;
    }
  });
  return effective;
};

export const platformPolicyEntries = (policies = {}) => platformSettingsCatalog.map(({ key }) => [
  `${PLATFORM_POLICY_PREFIX}${key}`,
  normalizePlatformPolicy(policies[key]),
]);
