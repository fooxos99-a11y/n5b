import { trimTrailingCharacter } from '../../shared/string-suffix.js';

export const resolveAssetUrl = (value) => {
  const source = String(value || '').trim();
  if (!source || /^(?:https?:|data:|blob:)/i.test(source)) {
    return source;
  }
  const configuredBase = String(import.meta.env.BASE_URL || '/');
  const base = configuredBase.endsWith('/') ? `${trimTrailingCharacter(configuredBase, '/')}/` : configuredBase;
  const normalizedSource = source.replace(/^\/+/, '');
  if (base !== '/' && source.startsWith(base)) return source;
  return `${base}${normalizedSource}`;
};
