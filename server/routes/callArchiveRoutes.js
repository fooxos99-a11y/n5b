import express from 'express';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { db, getDatabaseContext } from '../db.js';
import { callArchiveCapabilities, getCallArchiveConfig } from '../services/callArchiveConfig.js';
import { canManageCallArchive, canAccessCallArchive, canReviewCallArchive, callArchiveSqlScope, publicCallArchiveSession, parseCallArchiveJson, queueCallArchiveJob } from '../services/callArchive.js';
import { createCallArchiveStorage, parseArchiveRange } from '../services/callArchiveStorage.js';

const router = express.Router();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const uuid = value => /^[a-f0-9-]{36}$/.test(String(value || ''));
const pageSize = req => Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 30));
const forbidden = res => res.status(403).json({ message: 'ليس لديك صلاحية الوصول إلى هذا الأرشيف.' });
const loadSession = async id => uuid(id) ? (await db().query('SELECT * FROM call_archive_sessions WHERE id=? LIMIT 1', [id]))[0][0] : null;
async function authorized(req, res) {
  const session = await loadSession(req.params.sessionId);
  if (!session) { res.status(404).json({ message: 'الجلسة غير موجودة.' }); return null; }
  if (!await canAccessCallArchive(req.auth, session)) { forbidden(res); return null; }
  return session;
}

// This capability endpoint intentionally precedes normal authentication. The
// random token is stored hashed, expires after two minutes, and is revocable
// with its originating login session. It never exposes a bucket/object path.
router.get('/playback/:token', async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return forbidden(res);
    const [[grant]] = await db().query(`SELECT * FROM call_archive_playback_grants WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP(3) LIMIT 1`, [sha(req.params.token)]);
    if (!grant) return forbidden(res);
    if (!await canManageCallArchive({ role: grant.actor_role, id: Number(grant.actor_id) })) return forbidden(res);
    if (grant.auth_token_hash) {
      const [[authSession]] = await db().query(`SELECT 1 AS active FROM auth_sessions session
        LEFT JOIN students student ON session.user_role='student' AND student.id=session.user_id
        LEFT JOIN supervisors staff ON session.user_role IN ('manager','admin','supervisor','reciter') AND staff.id=session.user_id
        WHERE session.token_hash=? AND session.user_role=? AND session.user_id=? AND (session.expires_at IS NULL OR session.expires_at>CURRENT_TIMESTAMP) AND
          ((student.id IS NOT NULL AND student.password_hash IS NOT NULL AND student.password_hash<>'') OR
          (staff.id IS NOT NULL AND staff.role=session.user_role AND staff.is_active=1 AND staff.password_hash IS NOT NULL AND staff.password_hash<>'')) LIMIT 1`,
      [grant.auth_token_hash, grant.actor_role, grant.actor_id]);
      if (!authSession) return forbidden(res);
    }
    const session = await loadSession(grant.session_id);
    if (!await canAccessCallArchive({ role: grant.actor_role, id: Number(grant.actor_id) }, session)) return forbidden(res);
    const [[media]] = await db().query("SELECT * FROM call_archive_media WHERE id=? AND session_id=? AND state='ready' LIMIT 1", [grant.media_id, session.id]);
    if (!media) return res.status(404).json({ message: 'التسجيل غير متاح بعد.' });
    const storage = createCallArchiveStorage(), details = await storage.head(media);
    let range;
    try { range = parseArchiveRange(req.get('Range'), details.length); }
    catch { return res.status(416).set('Content-Range', `bytes */${details.length}`).end(); }
    res.set({ 'Content-Type': media.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="call-recording.mp4"',
      'Content-Length': String(range ? range.end - range.start + 1 : details.length) });
    if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${details.length}`);
    if (req.method === 'HEAD') return res.end();
    await pipeline(await storage.read(media, range), res);
  } catch (error) { if (!res.headersSent) next(error); else res.destroy(); }
});

router.use((req, res, next) => req.auth ? next() : res.status(401).json({ message: 'يلزم تسجيل الدخول.' }));
router.use(async (req, res, next) => {
  try { return await canManageCallArchive(req.auth) ? next() : forbidden(res); }
  catch (error) { return next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const scope = await callArchiveSqlScope(req.auth), size = pageSize(req);
    const before = req.query.before ? Number(req.query.before) : null;
    if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) return res.status(422).json({ message: 'مؤشر الأرشيف غير صالح.' });
    const [rows] = await db().query(`SELECT s.room_id AS id,COALESCE(MAX(r.name),MAX(s.room_name)) AS name,MAX(s.committee_name) AS committeeName,
      COUNT(*) AS sessionCount,MAX(s.started_at) AS lastSessionAt,COALESCE(MAX(r.status),'archived') AS status
      FROM call_archive_sessions s LEFT JOIN call_rooms r ON r.id=s.room_id WHERE ${scope.sql} ${before ? 'AND s.room_id<?' : ''}
      GROUP BY s.room_id ORDER BY s.room_id DESC LIMIT ?`, [...scope.params, ...(before ? [before] : []), size + 1]);
    const visible = rows.slice(0, size).map(row => ({ ...row, id: String(row.id), sessionCount: Number(row.sessionCount), lastSessionAt: new Date(row.lastSessionAt).toISOString() }));
    res.set('Cache-Control', 'no-store').json({ rooms: visible, nextCursor: rows.length > size ? visible.at(-1).id : null, capabilities: callArchiveCapabilities() });
  } catch (error) { next(error); }
});

router.get('/rooms/:roomId', async (req, res, next) => {
  try {
    const id = Number(req.params.roomId);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ message: 'الغرفة غير موجودة.' });
    const scope = await callArchiveSqlScope(req.auth), size = pageSize(req);
    let cursor;
    if (req.query.before) {
      cursor = await loadSession(req.query.before);
      if (!cursor || Number(cursor.room_id) !== id || !await canAccessCallArchive(req.auth, cursor)) return res.status(422).json({ message: 'مؤشر الجلسات غير صالح.' });
    }
    const [rows] = await db().query(`SELECT s.* FROM call_archive_sessions s WHERE s.room_id=? AND ${scope.sql}
      ${cursor ? 'AND (s.started_at<? OR (s.started_at=? AND s.id<?))' : ''}
      ORDER BY s.started_at DESC,s.id DESC LIMIT ?`, [id, ...scope.params, ...(cursor ? [cursor.started_at, cursor.started_at, cursor.id] : []), size + 1]);
    const sessions = rows.slice(0, size).map(publicCallArchiveSession);
    if (!sessions.length && !cursor) return forbidden(res);
    const source = sessions[0] || publicCallArchiveSession(cursor);
    res.set('Cache-Control', 'no-store').json({ room: { id: String(id), name: source.roomName, committeeName: source.committeeName }, sessions,
      nextCursor: rows.length > size ? sessions.at(-1).id : null });
  } catch (error) { next(error); }
});

router.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    const session = await authorized(req, res); if (!session) return;
    const [participants] = await db().query(`SELECT identity,user_role AS role,user_id AS userId,user_name AS name,
      joined_at AS joinedAt,left_at AS leftAt,consented_at AS consentedAt FROM call_archive_participants WHERE session_id=? ORDER BY joined_at`, [session.id]);
    const [rows] = await db().query('SELECT * FROM call_archive_media WHERE session_id=? ORDER BY kind,started_at,id', [session.id]);
    const report = parseCallArchiveJson(session.report_json);
    res.set('Cache-Control', 'no-store').json({ session: publicCallArchiveSession(session), participants,
      media: rows.map(row => ({ id: row.id, kind: row.kind, identity: row.identity, status: row.state,
        durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds), bytes: row.bytes == null ? null : Number(row.bytes), available: row.state === 'ready' })),
      report: report ? { ...report, review: parseCallArchiveJson(session.review_json) } : null,
      review: parseCallArchiveJson(session.review_json), canReview: await canReviewCallArchive(req.auth, session) });
  } catch (error) { next(error); }
});

router.post('/sessions/:sessionId/media/:mediaId/playback', async (req, res, next) => {
  try {
    const session = await authorized(req, res); if (!session) return;
    if (!req.auth.tokenHash) return res.status(401).json({ message: 'يلزم تسجيل الدخول من جديد لتشغيل التسجيل.' });
    const [[media]] = await db().query("SELECT id FROM call_archive_media WHERE id=? AND session_id=? AND state='ready' LIMIT 1", [req.params.mediaId, session.id]);
    if (!media) return res.status(404).json({ message: 'التسجيل غير متاح بعد.' });
    const token = crypto.randomBytes(32).toString('hex'), expiresAt = new Date(Date.now() + 120000);
    await db().query(`INSERT INTO call_archive_playback_grants (token_hash,session_id,media_id,actor_role,actor_id,auth_token_hash,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 2 MINUTE))`,
      [sha(token), session.id, media.id, req.auth.role, req.auth.id, req.auth.tokenHash || null]);
    const registration = getDatabaseContext().tenant?.registrationNumber;
    res.set('Cache-Control', 'no-store').json({ url: `/api/calls/archive/playback/${token}${registration ? `?registrationNumber=${encodeURIComponent(registration)}` : ''}`, expiresAt: expiresAt.toISOString() });
  } catch (error) { next(error); }
});

router.put('/sessions/:sessionId/review', async (req, res, next) => {
  try {
    const session = await authorized(req, res); if (!session) return;
    if (!await canReviewCallArchive(req.auth, session)) return forbidden(res);
    const report = parseCallArchiveJson(session.report_json);
    const approved = req.body.approvedErrors;
    const observations = new Map((report?.observations || []).map(item => [item.id, item]));
    if (!Array.isArray(approved) || approved.length > 300 || approved.some(item => !observations.has(item.id)
      || observations.get(item.id).category !== 'possible_error' || typeof item.note !== 'string' || item.note.length > 2000)
      || new Set(approved.map(item => item.id)).size !== approved.length || typeof req.body.notes !== 'string' || req.body.notes.length > 10000) {
      return res.status(422).json({ message: 'ملاحظات الاعتماد غير صالحة. اعتمد فقط المواضع الموجودة في التقرير.' });
    }
    const review = { notes: req.body.notes.trim(), approvedErrors: approved.map(item => ({ id: item.id, note: item.note.trim() })),
      reviewedBy: { role: req.auth.role, id: String(req.auth.id), name: req.auth.name || 'مستخدم' }, reviewedAt: new Date().toISOString() };
    await db().query('UPDATE call_archive_sessions SET review_json=? WHERE id=?', [JSON.stringify(review), session.id]);
    res.json({ ok: true, review });
  } catch (error) { next(error); }
});

router.post('/sessions/:sessionId/retry', async (req, res, next) => {
  try {
    const session = await authorized(req, res); if (!session) return;
    if (!await canReviewCallArchive(req.auth, session)) return forbidden(res);
    const config = getCallArchiveConfig();
    if (!config.configured) return res.status(503).json({ message: 'خدمة التسجيل والتخزين غير مهيأة.' });
    let kind;
    if (session.active_room_id) {
      kind = session.state === 'stopping' ? 'stop' : 'capture';
      if (kind === 'capture') {
        const [[mixed]] = await db().query("SELECT 1 AS active FROM call_archive_media WHERE session_id=? AND kind='mixed' AND state='recording' LIMIT 1", [session.id]);
        await db().query("UPDATE call_archive_sessions SET state=?,report_state='pending',last_error=NULL WHERE id=? AND active_room_id IS NOT NULL AND state<>'stopping'", [mixed ? 'recording' : 'starting', session.id]);
      }
    }
    else {
      const [[mixed]] = await db().query("SELECT 1 AS available FROM call_archive_media WHERE session_id=? AND kind='mixed' AND state='ready' LIMIT 1", [session.id]);
      if (!mixed) return res.status(422).json({ message: 'لا يوجد تسجيل مكتمل لتحليله؛ لا يمكن استعادة صوت لم يُسجّل.' });
      if (!config.aiKey) return res.status(503).json({ message: 'خدمة تحليل الصوت غير مهيأة.' });
      if (session.report_state === 'ready') return res.status(409).json({ message: 'التقرير مكتمل بالفعل.' });
      kind = 'report';
      await db().query("UPDATE call_archive_sessions SET report_state='pending',last_error=NULL WHERE id=?", [session.id]);
    }
    await queueCallArchiveJob(db(), session.id, kind);
    await db().query("UPDATE call_archive_jobs SET state='pending',attempts=0,next_at=CURRENT_TIMESTAMP(3),last_error=NULL WHERE session_id=? AND kind=? AND state<>'running'", [session.id, kind]);
    res.status(202).json({ ok: true });
  } catch (error) { next(error); }
});

export default router;
