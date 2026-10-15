import { normalizeSiteRegistrationNumber } from '../../../shared/registration-link.js';

export type RegistrationEntry = { registrationNumber: string };

// A URL supplies a tenant key, never an API host or an authenticated role.
export function registrationEntryFromUrl(value: string | null, apiBase?: string): RegistrationEntry | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localScheme = url.protocol === 'nukhab:';
    const trustedWeb = apiBase && url.origin === new URL(apiBase).origin;
    if (!localScheme && !trustedWeb) return null;
    const registerPath = (url.hostname === 'register' || url.pathname.replace(/\/$/, '') === '/register');
    if (!registerPath && url.searchParams.get('registration') !== '1') return null;
    const registrationNumber = normalizeSiteRegistrationNumber(url.searchParams.get('registrationNumber'));
    return registrationNumber ? { registrationNumber } : null;
  } catch { return null; }
}

export function configuredRegistrationEntry(value?: string): RegistrationEntry | null {
  const registrationNumber = normalizeSiteRegistrationNumber(value);
  return registrationNumber ? { registrationNumber } : null;
}
