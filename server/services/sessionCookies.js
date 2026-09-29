export const TENANT_SESSION_COOKIE = 'nukhab_session';
export const PLATFORM_SESSION_COOKIE = 'nukhab_platform_session';

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCookies = (header = '') => Object.fromEntries(
  String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [part, ''];
      return [
        safeDecode(part.slice(0, separator)),
        safeDecode(part.slice(separator + 1)),
      ];
    }),
);

export function getSessionCookie(req, name) {
  return String(parseCookies(req.get('cookie'))[name] || '').trim();
}

export function isNativeApiRequest(req) {
  return String(req.get('x-nukhab-native') || '') === '1';
}

const serializeSessionCookie = (req, name, token, maxAgeSeconds) => {
  const attributes = [
    `${encodeURIComponent(name)}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (req.secure || process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
};

export function setSessionCookie(req, res, name, token, days) {
  res.append(
    'Set-Cookie',
    serializeSessionCookie(req, name, token, Number(days || 1) * 24 * 60 * 60),
  );
}

export function clearSessionCookie(req, res, name) {
  res.append('Set-Cookie', serializeSessionCookie(req, name, '', 0));
}
