import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createIpRateLimiter,
  enforceContentLength,
  requireBearerHeader,
  securityHeaders,
} from '../server/middleware/security.js';

test('isolated undo server disables framework disclosure before registering middleware', async () => {
  const source = await readFile(new URL('./dashboardUndo.mysql.mjs', import.meta.url), 'utf8');
  assert.match(source, /const app = express\(\);\s*app\.disable\('x-powered-by'\);\s*app\.use\(/);
});

function createResponse() {
  const headers = {};
  return {
    statusCode: 200,
    payload: null,
    set(name, value) {
      if (typeof name === 'object') Object.assign(headers, name);
      else headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    headers,
  };
}

const request = ({ ip = '127.0.0.1', secure = false, headers = {} } = {}) => ({
  ip,
  secure,
  socket: {},
  get(name) {
    return headers[String(name).toLowerCase()];
  },
});

test('security middleware sets browser protections and HSTS for HTTPS', () => {
  const res = createResponse();
  let continued = false;
  securityHeaders(request({ secure: true }), res, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(res.headers['Permissions-Policy'], /microphone=\(self\)/);
  assert.match(res.headers['Strict-Transport-Security'], /max-age=31536000/);
});

test('rate limiter, bearer precheck, and content length limits reject excess requests', () => {
  const limiter = createIpRateLimiter({
    keyPrefix: `test-${Date.now()}`,
    windowMs: 60_000,
    maxRequests: 2,
  });
  const req = request({ ip: '192.0.2.1' });

  limiter(req, createResponse(), () => {});
  limiter(req, createResponse(), () => {});
  const limited = createResponse();
  limiter(req, limited, () => assert.fail('rate limiter must stop the request'));
  assert.equal(limited.statusCode, 429);

  const unauthorized = createResponse();
  requireBearerHeader(request(), unauthorized, () => assert.fail('missing bearer must be rejected'));
  assert.equal(unauthorized.statusCode, 401);

  const oversized = createResponse();
  enforceContentLength(10)(
    request({ headers: { 'content-length': '11' } }),
    oversized,
    () => assert.fail('oversized request must be rejected'),
  );
  assert.equal(oversized.statusCode, 413);
});
