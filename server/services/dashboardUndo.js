import { randomBytes } from 'node:crypto';
import express from 'express';
import { undoContext, finalChanges, restoreJournal } from './undoJournal.js';

const WINDOW_MS = 10_000;
const MAX_STORED_BYTES = 64 * 1024 * 1024;
const isStaff = req => ['manager', 'admin', 'supervisor', 'reciter'].includes(req.auth?.role);
const identity = (req, database) => JSON.stringify([database, req.auth?.role, req.auth?.id, req.auth?.tokenHash]);
const externalOperation = path => /^\/api\/grading\/(?:track-compensation|program-compensation|excuse-approval|compensations\/)/.test(path) || /(?:\/(?:auth|calls|whatsapp|backups|notification-management|account-deletion)(?:\/|$))|(?:\/(?:send|send-whatsapp|reset-points|delete-program-data|end-term)$)/.test(path);

export function createDashboardUndo({ db, databaseName, hasPermission, now = Date.now, schedule = setTimeout }) {
  const actions = new Map();
  let storedBytes = 0;
  const forget = id => {
    const action = actions.get(id);
    if (action) { storedBytes -= action.bytes; actions.delete(id); }
  };
  const remember = (req, journal) => {
    if (journal.disabled || !journal.groups.length || storedBytes + journal.bytes > MAX_STORED_BYTES) return null;
    try { if (!finalChanges(journal.groups).length) return null; } catch { return null; }
    if (req.auth.role !== 'manager' && !journal.permissions.length) return null;
    const id = randomBytes(32).toString('hex');
    const expiresAt = now() + WINDOW_MS;
    actions.set(id, { ...journal, owner: identity(req, databaseName()), expiresAt });
    storedBytes += journal.bytes;
    schedule(() => forget(id), WINDOW_MS).unref?.();
    return { id, expiresAt, durationMs: WINDOW_MS };
  };
  const capture = (req, res, next) => {
    if (req.get('X-Dashboard-Undo') !== '1' || !isStaff(req) || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      || externalOperation(req.path) || req.path.startsWith('/api/dashboard-undo')) return next();
    const journal = { groups: [], permissions: [], bytes: 0, disabled: false, closed: false };
    const send = res.json.bind(res);
    res.json = body => {
      journal.closed = true;
      if (res.statusCode < 400) {
        const undo = remember(req, journal);
        if (undo) res.set('X-Dashboard-Undo', JSON.stringify(undo));
      }
      return send(body);
    };
    res.on('close', () => { journal.closed = true; });
    return undoContext.run(journal, next);
  };
  const router = express.Router();
  router.post('/:id', async (req, res, next) => {
    const action = actions.get(req.params.id);
    if (!isStaff(req) || action?.owner !== identity(req, databaseName())) return res.status(404).json({ message: 'التراجع غير متاح.' });
    if (action.expiresAt <= now()) { forget(req.params.id); return res.status(410).json({ message: 'انتهت مهلة التراجع.' }); }
    if (action.busy) return res.status(409).json({ message: 'جارٍ التراجع عن هذا الأمر.' });
    action.busy = true;
    let connection;
    try {
      if (req.auth.role !== 'manager') {
        for (const keys of action.permissions) {
          if (!keys || !await hasPermission(req.auth.id, keys)) return res.status(403).json({ message: 'لم تعد لديك صلاحية التراجع عن هذا الأمر.' });
        }
      }
      connection = await db().getConnection();
      await connection.beginTransaction();
      try { await restoreJournal(connection, action.groups); }
      catch {
        await connection.rollback();
        forget(req.params.id);
        return res.status(409).json({ message: 'تعذر التراجع لأن البيانات تغيرت أو ارتبطت بعملية أخرى. أعد تحميل البيانات.' });
      }
      await connection.commit();
      forget(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      return next(error);
    } finally {
      action.busy = false;
      connection?.release();
    }
  });
  return { capture, router };
}
