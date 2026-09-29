import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSessionCookie,
  getSessionCookie,
  isNativeApiRequest,
  setSessionCookie,
  TENANT_SESSION_COOKIE,
} from '../server/services/sessionCookies.js';

const request = (headers = {}, secure = false) => ({
  secure,
  get(name) {
    return headers[String(name).toLowerCase()];
  },
});

const response = () => {
  const headers = new Map();
  return {
    append(name, value) {
      const key = String(name).toLowerCase();
      headers.set(key, [...(headers.get(key) || []), value]);
    },
    headers,
  };
};

test('session cookies are HttpOnly, scoped, strict, and secure over HTTPS', () => {
  const res = response();
  setSessionCookie(request({}, true), res, TENANT_SESSION_COOKIE, 'secret token', 30);
  const cookie = res.headers.get('set-cookie')[0];

  assert.match(cookie, /^nukhab_session=secret%20token;/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=2592000/);
});

test('session cookie parsing tolerates malformed encoding and logout expires it', () => {
  const req = request({
    cookie: 'other=value; nukhab_session=abc%20123; malformed=%E0%A4%A',
    'x-nukhab-native': '1',
  });
  const res = response();

  assert.equal(getSessionCookie(req, TENANT_SESSION_COOKIE), 'abc 123');
  assert.equal(isNativeApiRequest(req), true);
  clearSessionCookie(req, res, TENANT_SESSION_COOKIE);
  assert.match(res.headers.get('set-cookie')[0], /Max-Age=0/);
});
