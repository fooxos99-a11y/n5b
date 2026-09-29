const DEFAULT_API_WINDOW_MS = 60 * 1000;
const DEFAULT_API_MAX_REQUESTS = 600;
const MAX_RATE_LIMIT_KEYS = 10_000;

const rateLimitBuckets = new Map();

const cleanupRateLimitBuckets = () => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  if (rateLimitBuckets.size <= MAX_RATE_LIMIT_KEYS) return;
  const overflow = rateLimitBuckets.size - MAX_RATE_LIMIT_KEYS;
  [...rateLimitBuckets.entries()]
    .sort((first, second) => first[1].resetAt - second[1].resetAt)
    .slice(0, overflow)
    .forEach(([key]) => rateLimitBuckets.delete(key));
};

const cleanupTimer = setInterval(cleanupRateLimitBuckets, 5 * 60 * 1000);
cleanupTimer.unref?.();

export function securityHeaders(req, res, next) {
  const headers = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; '),
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  };
  if (req.secure) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  res.set(headers);
  next();
}

export function createIpRateLimiter({
  keyPrefix = 'api',
  windowMs = DEFAULT_API_WINDOW_MS,
  maxRequests = DEFAULT_API_MAX_REQUESTS,
} = {}) {
  return function ipRateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${String(req.ip || req.socket?.remoteAddress || 'unknown')}`;
    const current = rateLimitBuckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    res.set('X-RateLimit-Scope', keyPrefix);
    res.set('RateLimit-Limit', String(maxRequests));
    res.set('RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));
    res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > maxRequests) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ message: 'طلبات كثيرة. حاول مرة أخرى بعد قليل.' });
    }
    return next();
  };
}

export function requireBearerHeader(req, res, next) {
  const authorization = String(req.get('authorization') || '');
  if (!authorization.startsWith('Bearer ') || authorization.slice(7).trim().length < 32) {
    return res.status(401).json({ message: 'سجل الدخول أولًا.' });
  }
  return next();
}

export function enforceContentLength(maxBytes) {
  return function contentLengthLimit(req, res, next) {
    const contentLength = Number(req.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return res.status(413).json({ message: 'حجم الطلب أكبر من الحد المسموح.' });
    }
    return next();
  };
}

// Separate expensive verse downloads from interactive API requests, including older clients.
export function createApiRateLimiter() {
  const interactive = createIpRateLimiter();
  const verses = createIpRateLimiter({ keyPrefix: 'recitation-ayahs', maxRequests: 120 });
  return (req, res, next) => (/^\/supervisors\/[^/]+\/quran-evaluation\/[^/]+\/ayahs\/?$/.test(req.path)
    ? verses : interactive)(req, res, next);
}
