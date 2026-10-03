// Root entry links work on static hosts that do not rewrite /register to index.html.
export function buildRegistrationLink({ origin, basePath = '/', publicUrl, native = false, registrationNumber = '' }) {
  const url = native ? new globalThis.URL(publicUrl) : new globalThis.URL(basePath.endsWith('/') ? basePath : `${basePath}/`, origin);
  url.search = '';
  url.hash = '';
  url.searchParams.set('registration', '1');
  const number = String(registrationNumber).trim();
  if (number) url.searchParams.set('registrationNumber', number);
  return url.href;
}

export function isRegistrationEntry(search = '') {
  return new globalThis.URLSearchParams(search).get('registration') === '1';
}

// Tenant identifiers are opaque database keys, never URLs or request syntax.
export function normalizeSiteRegistrationNumber(value) {
  const number = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{1,32}$/.test(number) ? number : '';
}
