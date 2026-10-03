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
