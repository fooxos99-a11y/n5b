const PREVIEW = Object.freeze({
  name: 'نخب تجريبي',
  slug: 'nukhab-preview',
  scheme: 'nukhab-preview',
  bundleIdentifier: 'sa.nukhab.app.preview',
  apiBaseUrl: 'https://nokhab.cc/n5b-expo-preview/api',
  registrationNumber: 'expo-preview',
});

/**
 * The existing app stays the default; a preview build must opt into its isolated API.
 * @param {import('expo/config').ExpoConfig} config
 * @param {Record<string, string | undefined>} env
 */
function appVariant(config, env = process.env) {
  const variant = env.NUKHAB_APP_VARIANT || '';
  if (!variant) return config;
  if (variant !== 'testflight-preview') throw new Error('Unknown Nukhba app variant');
  if (env.EXPO_PUBLIC_API_BASE_URL !== PREVIEW.apiBaseUrl
    || env.EXPO_PUBLIC_REGISTRATION_NUMBER !== PREVIEW.registrationNumber) {
    throw new Error('Preview builds require the isolated preview API and registration');
  }
  if (env.EXPO_PUBLIC_NATIVE_PROBES !== '0') throw new Error('Preview release probes must be disabled');
  const buildNumber = env.NUKHAB_BUILD_NUMBER;
  if (!buildNumber || !/^[1-9]\d{0,8}$/.test(buildNumber)) throw new Error('Invalid preview build number');
  return {
    ...config,
    name: PREVIEW.name,
    slug: PREVIEW.slug,
    scheme: PREVIEW.scheme,
    version: '0.1.0',
    ios: {
      ...config.ios,
      bundleIdentifier: PREVIEW.bundleIdentifier,
      buildNumber,
      infoPlist: { ...config.ios?.infoPlist, ITSAppUsesNonExemptEncryption: false },
    },
    android: { ...config.android, package: PREVIEW.bundleIdentifier, versionCode: Number(buildNumber) },
  };
}

module.exports = { appVariant, PREVIEW };
