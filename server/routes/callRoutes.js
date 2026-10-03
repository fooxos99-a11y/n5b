import crypto from 'node:crypto';
import express from 'express';
import { db } from '../db.js';
import {
  closeLiveKitCallRoom,
  createLiveKitCallToken,
  isLiveKitConfigured,
  listLiveKitParticipants,
} from '../services/livekitCalls.js';
import { hasSupervisorDashboardPermission, permissionDenied } from '../services/dashboardPermissions.js';
import { siteKey } from '../siteConfig.js';
import { subscribeLiveKitPresence } from '../services/livekitPresenceEvents.js';

const router = express.Router();

async function getCommitteeOptions(auth) {
  if (['manager', 'admin'].includes(auth?.role)) {
    const [rows] = await db().query('SELECT id, name FROM committees ORDER BY name ASC');
    return rows.map((row) => ({ id: String(row.id), name: row.name }));
  }
  if (auth?.role === 'supervisor') {
    const [rows] = await db().query(
      `
      SELECT c.id, c.name
      FROM supervisor_committees sc
      JOIN committees c ON c.id = sc.committee_id
      WHERE sc.supervisor_id = ?
      ORDER BY c.name ASC
      `,
      [auth.id]
    );
    return rows.map((row) => ({ id: String(row.id), name: row.name }));
  }
  if (auth?.role === 'student') {
    const [[row]] = await db().query(
      'SELECT c.id, c.name FROM students s JOIN committees c ON c.id = s.committee_id WHERE s.id = ? LIMIT 1',
      [auth.id]
    );
    return row ? [{ id: String(row.id), name: row.name }] : [];
  }
  return [];
}

async function canAccessCommittee(auth, committeeId) {
  if (!committeeId) return true;
  if (['manager', 'admin'].includes(auth?.role)) return true;
  const committees = await getCommitteeOptions(auth);
  return committees.some((committee) => Number(committee.id) === Number(committeeId));
}

const canCreateRoom = (auth) => ['manager', 'admin', 'supervisor'].includes(auth?.role);

async function hasCallAccess(auth) {
  if (['manager', 'supervisor', 'student'].includes(auth?.role)) return true;
  return auth?.role === 'admin' && await hasSupervisorDashboardPermission(auth.id, 'calls');
}

router.use(async (req, res, next) => {
  try { return await hasCallAccess(req.auth) ? next() : permissionDenied(res); }
  catch (error) { return next(error); }
});

async function loadCallDirectory(req) {
    const committees = await getCommitteeOptions(req.auth);
    const committeeIds = committees.map((committee) => Number(committee.id));
    const filters = ["r.status = 'open'"];
    const params = [];
    if (!['manager', 'admin'].includes(req.auth?.role)) {
      if (committeeIds.length) {
        filters.push(`(r.committee_id IS NULL OR r.committee_id IN (${committeeIds.map(() => '?').join(', ')}))`);
        params.push(...committeeIds);
      } else {
        filters.push('r.committee_id IS NULL');
      }
    }
    const [rooms] = await db().query(
      `
      SELECT
        r.id,
        r.name,
        r.status,
        r.livekit_room_name AS livekitRoomName,
        r.committee_id AS committeeId,
        COALESCE(c.name, 'غرفة عامة') AS committeeName,
        r.created_by_role AS createdByRole,
        r.created_by_id AS createdById,
        r.created_by_name AS createdByName,
        DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
        DATE_FORMAT(r.closed_at, '%Y-%m-%dT%H:%i:%s') AS closedAt
      FROM call_rooms r
      LEFT JOIN committees c ON c.id = r.committee_id
      WHERE ${filters.join(' AND ')}
      ORDER BY (r.status = 'open') DESC, r.created_at DESC
      `,
      params
    );
    const creatorId = Number(req.auth?.id || 0);
    const visible = [];
    // Bound media requests instead of issuing one unbounded request per room.
    for (let offset = 0; offset < rooms.length; offset += 8) {
      visible.push(...await Promise.all(rooms.slice(offset, offset + 8).map(async room => {
        const participants = isLiveKitConfigured() ? await listLiveKitParticipants(room.livekitRoomName) : [];
        const { livekitRoomName: _privateName, ...publicRoom } = room;
        return { ...publicRoom, id: String(room.id), committeeId: room.committeeId == null ? null : String(room.committeeId),
          participants, studentPresent: participants.some(person => person.role === 'student'),
          isOwner: room.createdByRole === req.auth.role && Number(room.createdById || 0) === creatorId,
          canClose: req.auth.role === 'manager' || (room.createdByRole === req.auth.role && Number(room.createdById || 0) === creatorId) };
      })));
    }
    return { rooms: visible, committees, canCreate: canCreateRoom(req.auth),
      committeeSelectionLocked: req.auth.role === 'supervisor' && committees.length <= 1,
      canCreateGeneral: ['manager', 'admin'].includes(req.auth.role), livekitConfigured: isLiveKitConfigured() };
}

router.get('/', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await loadCallDirectory(req)); }
  catch (error) { next(error); }
});

/** Server-pushed live snapshots; scope and session are rechecked on every update. */
router.get('/events', async (req, res, next) => {
  let timer, ended = false, previous = '', sending = false, dirty = false;
  let unsubscribe = () => {};
  const finish = () => { ended = true; clearTimeout(timer); unsubscribe(); };
  res.on('close', finish);
  const send = async () => {
    if (sending) { dirty = true; return; }
    sending = true;
    try {
      if (ended) return;
      if (req.auth.tokenHash) {
        const [[session]] = await db().query('SELECT 1 AS active FROM auth_sessions WHERE token_hash = ?', [req.auth.tokenHash]);
        if (!session) { finish(); return res.end(); }
      }
      if (!await hasCallAccess(req.auth)) { finish(); return res.end(); }
      const snapshot = JSON.stringify(await loadCallDirectory(req));
      if (!res.headersSent) {
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store, no-cache, no-transform', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
      }
      if (ended) return;
      if (snapshot !== previous) { res.write(`data: ${snapshot}\n\n`); previous = snapshot; }
      else res.write(': heartbeat\n\n');
    } catch (error) {
      if (!res.headersSent) { finish(); return next(error); }
      if (!ended) res.write(`event: unavailable\ndata: {"message":"تعذر تحديث المكالمات؛ جارٍ إعادة الاتصال."}\n\n`);
    }
    finally { sending = false; }
    if (!ended) timer = setTimeout(send, dirty ? 0 : 2000);
    dirty = false;
  };
  unsubscribe = subscribeLiveKitPresence(() => { clearTimeout(timer); void send(); });
  await send();
});

router.post('/', async (req, res, next) => {
  try {
    if (!canCreateRoom(req.auth)) {
      return res.status(403).json({ message: 'إنشاء الغرف متاح لمشرفي المسارات والإدارة فقط.' });
    }
    if (!isLiveKitConfigured()) {
      return res.status(503).json({ message: 'خدمة المكالمات غير مهيأة حالياً.' });
    }
    const name = String(req.body.name || '').trim().slice(0, 180);
    const supervisorCommittees = req.auth?.role === 'supervisor'
      ? await getCommitteeOptions(req.auth)
      : [];
    const _resolveCommitteeId = () => {
      if (req.auth?.role === 'supervisor') {
        return Number(req.body.committeeId || (supervisorCommittees.length === 1 ? supervisorCommittees[0].id : 0));
      }
      if (req.body.committeeId) {
        return Number(req.body.committeeId);
      }
      return null;
    };
    const committeeId = _resolveCommitteeId();
    if (!name || (req.auth?.role === 'supervisor' && !committeeId)) {
      return res.status(422).json({ message: 'اسم الغرفة مطلوب، ويجب ربط غرفة مشرف المسار بحلقة.' });
    }
    if (!await canAccessCommittee(req.auth, committeeId)) {
      return res.status(403).json({ message: 'لا يمكنك إنشاء غرفة لهذه الحلقة.' });
    }
    const livekitRoomName = `${siteKey}-call-${Date.now()}-${crypto.randomUUID()}`;
    const [result] = await db().query(
      `
      INSERT INTO call_rooms
        (name, livekit_room_name, committee_id, created_by_role, created_by_id, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [name, livekitRoomName, committeeId, req.auth.role, Number(req.auth.id || 0), req.auth.name || 'مستخدم']
    );
    res.status(201).json({ ok: true, id: String(result.insertId) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/token', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id || 0);
    const [[room]] = await db().query(
      'SELECT id, name, livekit_room_name AS livekitRoomName, committee_id AS committeeId, status FROM call_rooms WHERE id = ? LIMIT 1',
      [roomId]
    );
    if (room?.status !== 'open') {
      return res.status(404).json({ message: 'الغرفة غير متاحة.' });
    }
    if (!await canAccessCommittee(req.auth, room.committeeId)) {
      return res.status(403).json({ message: 'هذه الغرفة غير متاحة لحسابك.' });
    }
    const userId = Number(req.auth.id || 0);
    const credentials = await createLiveKitCallToken({
      roomName: room.livekitRoomName,
      identity: `${req.auth.role}:${userId}`,
      name: req.auth.name || 'مستخدم',
      metadata: { nukhabRoomId: roomId, role: req.auth.role },
    });
    await db().query(
      `
      INSERT INTO call_room_participants
        (room_id, user_role, user_id, user_name)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_name = VALUES(user_name),
        join_count = join_count + 1,
        last_joined_at = CURRENT_TIMESTAMP,
        last_left_at = NULL
      `,
      [roomId, req.auth.role, userId, req.auth.name || 'مستخدم']
    );
    res.json({ ...credentials, room: { id: String(room.id), name: room.name } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    await db().query(
      `
      UPDATE call_room_participants
      SET last_left_at = CURRENT_TIMESTAMP
      WHERE room_id = ? AND user_role = ? AND user_id = ?
      `,
      [Number(req.params.id || 0), req.auth.role, Number(req.auth.id || 0)]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/close', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id || 0);
    const [[room]] = await db().query(
      'SELECT id, livekit_room_name AS livekitRoomName, status, created_by_role AS createdByRole, created_by_id AS createdById FROM call_rooms WHERE id = ? LIMIT 1',
      [roomId]
    );
    if (!room) return res.status(404).json({ message: 'الغرفة غير موجودة.' });
    const isOwner = room.createdByRole === req.auth?.role
      && Number(room.createdById || 0) === Number(req.auth?.id || 0);
    if (!isOwner && req.auth?.role !== 'manager') {
      return res.status(403).json({ message: 'منشئ الغرفة أو المدير فقط يستطيع إغلاقها.' });
    }
    if (room.status === 'open') {
      await closeLiveKitCallRoom(room.livekitRoomName);
      await db().query(
        "UPDATE call_rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [roomId]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
