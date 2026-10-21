import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createIpRateLimiter } from '../middleware/security.js';

export const PASSING_LINK_KEY = 'passingEntryTokenHash';
export const passingTokenHash = token => createHash('sha256').update(token).digest('hex');
const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const tokenPattern = /^[a-f0-9]{64}$/;
const entryLimiter = createIpRateLimiter({ keyPrefix: 'passing-entry', windowMs: 60_000, maxRequests: 20 });
const guestRules = [
  ['GET', /^\/students$/],
  ['GET', /^\/students\/[1-9]\d*\/(?:parts|report)$/],
  ['POST', /^\/?$/],
  ['GET', /^\/parts\/[1-9]\d*\/segments\/\d+\/mushaf$/],
  ['POST', /^\/parts\/[1-9]\d*\/(?:attempts|rehifz)$/],
];
export function passingGuestPath(req) {
  const path = req.path.replace(/^\/api(?=\/)/, '');
  return path === '/passing/guest' || path.startsWith('/passing/guest/') ? path.slice('/passing/guest'.length) : null;
}
export const isPassingGuestRequest = req => passingGuestPath(req) !== null || Boolean(req.get('x-passing-session') || req.get('x-passing-link'));

export function normalizeReciterName(value) {
  if (typeof value !== 'string') throw fail('أدخل اسم المقرئ.', 422);
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 160 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw fail('أدخل اسم المقرئ من حرفين إلى 160 حرفًا.', 422);
  return name;
}
async function currentLinkHash(connection) {
  const [[row]] = await connection.query('SELECT setting_value AS hash FROM app_settings WHERE setting_key=?', [PASSING_LINK_KEY]);
  return tokenPattern.test(row?.hash || '') ? row.hash : '';
}
export async function openPassingGuestSession(connection, { linkToken, name }) {
  if (typeof linkToken !== 'string' || !tokenPattern.test(linkToken)) throw fail('رابط الاجتياز غير صالح أو متوقف.');
  const linkHash = await currentLinkHash(connection);
  if (!linkHash || !timingSafeEqual(Buffer.from(linkHash, 'hex'), Buffer.from(passingTokenHash(linkToken), 'hex'))) throw fail('رابط الاجتياز غير صالح أو متوقف.');
  const reciterName = normalizeReciterName(name);
  const token = randomBytes(32).toString('hex');
  await connection.query('DELETE FROM passing_guest_sessions WHERE expires_at <= NOW()');
  await connection.query(`INSERT INTO passing_guest_sessions(token_hash,link_hash,reciter_name,expires_at)
    VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 12 HOUR))`, [passingTokenHash(token), linkHash, reciterName]);
  return { token, name: reciterName };
}
export async function loadPassingGuestSession(connection, token) {
  if (typeof token !== 'string' || !tokenPattern.test(token)) throw fail('أدخل اسم المقرئ لبدء الاجتياز.', 401);
  const [[session]] = await connection.query(`SELECT g.id,g.reciter_name AS name FROM passing_guest_sessions g
    JOIN app_settings a ON a.setting_key=? AND a.setting_value=g.link_hash
    WHERE g.token_hash=? AND g.expires_at>NOW()`, [PASSING_LINK_KEY, passingTokenHash(token)]);
  if (!session) throw fail('انتهت جلسة الاجتياز. أدخل اسم المقرئ من جديد.', 401);
  return { role: 'passing_guest', id: Number(session.id), name: session.name };
}
export function authenticatePassingGuest(connection) {
  return async (req, res, next) => {
    try {
      const path = passingGuestPath(req);
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      if (path === '/session' && req.method === 'POST') {
        return entryLimiter(req, res, () => {
          void openPassingGuestSession(connection(), { linkToken: req.get('x-passing-link'), name: req.body?.name })
            .then(session => res.status(201).json(session)).catch(next);
        });
      }
      if (path === null || !guestRules.some(([method, pattern]) => req.method === method && pattern.test(path))) throw fail('هذه الجلسة مخصصة للاجتياز فقط.');
      req.passingGuest = await loadPassingGuestSession(connection(), req.get('x-passing-session'));
      // A guest session never becomes an account session, even when a staff cookie is present.
      req.auth = undefined;
      return next();
    } catch (error) { return next(error); }
  };
}
