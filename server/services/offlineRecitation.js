import { assertRecitationCorrection } from './recitationCorrection.js';
import { assertRecitationReplacementCoverage } from './recitationSessionTransaction.js';
import crypto from 'node:crypto';
import { isUuid, recitationCandidateWins, recitationSessionTypeForTask } from '../../shared/offline-recitation.js';
import { normalizeMasterySessionIdentity } from './masterySessionIdentity.js';

const MAX_TRUSTED_ELAPSED_MS = 7 * 24 * 60 * 60 * 1000;

const sqlDateTime = (epochMs) => {
  const date = new Date(epochMs);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
};

const derivedUuid = (value) => {
  const hex = crypto.createHash('sha256').update(String(value || crypto.randomUUID())).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const normalizeServerSessionId = (sessionId, requestId) => (
  isUuid(sessionId) ? String(sessionId).toLowerCase() : derivedUuid(String(requestId || '').split(':')[0])
);

export async function registerRecitationDevice(connection, { req, deviceId, bootId, deviceEpochMs, monotonicMs }) {
  const normalizedDeviceId = isUuid(deviceId) ? String(deviceId).toLowerCase() : crypto.randomUUID();
  const normalizedBootId = isUuid(bootId) ? String(bootId).toLowerCase() : null;
  const safeDeviceEpoch = Number.isFinite(Number(deviceEpochMs)) ? Math.trunc(Number(deviceEpochMs)) : null;
  const safeMonotonic = Number.isFinite(Number(monotonicMs)) ? Number(monotonicMs) : null;
  const [[existingDevice]] = await connection.query(
    'SELECT actor_role AS actorRole, actor_id AS actorId FROM recitation_devices WHERE device_id = ? FOR UPDATE',
    [normalizedDeviceId],
  );
  if (existingDevice && (existingDevice.actorRole !== req.auth.role || Number(existingDevice.actorId) !== Number(req.auth.id))) {
    const error = new Error('معرّف الجهاز مرتبط بحساب آخر.');
    error.statusCode = 403;
    throw error;
  }
  await connection.query(
    `INSERT INTO recitation_devices
      (device_id, actor_role, actor_id, boot_id, anchor_server_at, anchor_device_epoch_ms, anchor_monotonic_ms, last_seen_at)
     VALUES (?, ?, ?, ?, NOW(3), ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE actor_role = VALUES(actor_role), actor_id = VALUES(actor_id),
       boot_id = VALUES(boot_id), anchor_server_at = NOW(3),
       anchor_device_epoch_ms = VALUES(anchor_device_epoch_ms), anchor_monotonic_ms = VALUES(anchor_monotonic_ms),
       revoked_at = NULL, last_seen_at = NOW(3)`,
    [normalizedDeviceId, req.auth.role, req.auth.id, normalizedBootId, safeDeviceEpoch, safeMonotonic],
  );
  const [[anchor]] = await connection.query(
    `SELECT device_id AS deviceId, boot_id AS bootId,
      UNIX_TIMESTAMP(anchor_server_at) * 1000 AS serverEpochMs,
      anchor_device_epoch_ms AS deviceEpochMs, anchor_monotonic_ms AS monotonicMs
     FROM recitation_devices WHERE device_id = ?`,
    [normalizedDeviceId],
  );
  return anchor;
}

export async function resolveTrustedDeviceEventTime(connection, {
  deviceId,
  bootId,
  eventMonotonicMs,
  committedAtLocal,
  actorRole = '',
  actorId = 0,
}) {
  const [[device]] = await connection.query(
    `SELECT actor_role AS actorRole, actor_id AS actorId, boot_id AS bootId,
      UNIX_TIMESTAMP(anchor_server_at) * 1000 AS serverEpochMs,
      anchor_monotonic_ms AS anchorMonotonicMs, revoked_at AS revokedAt
     FROM recitation_devices WHERE device_id = ? FOR UPDATE`,
    [deviceId],
  );
  const eventMonotonic = Number(eventMonotonicMs);
  const anchorMonotonic = Number(device?.anchorMonotonicMs);
  const elapsed = eventMonotonic - anchorMonotonic;
  const trusted = Boolean(
    device && !device.revokedAt && isUuid(bootId) && bootId === device.bootId
    && (!actorRole || (device.actorRole === actorRole && Number(device.actorId) === Number(actorId)))
    && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= MAX_TRUSTED_ELAPSED_MS
  );
  if (trusted) return { eventAt: sqlDateTime(Number(device.serverEpochMs) + elapsed), trusted: true };
  const localEpoch = Date.parse(String(committedAtLocal || ''));
  return { eventAt: Number.isFinite(localEpoch) ? sqlDateTime(localEpoch) : sqlDateTime(Date.now()), trusted: false };
}

/** True when today's accepted session belongs to another plan or an older version of this plan. */
export function recitedUnderEarlierPlan(slot, task, currentPlanVersion) {
  if (slot?.planId == null || task?.planId == null) return false;
  return Number(slot.planId) !== Number(task.planId) || Number(slot.planVersion || 0) < Number(currentPlanVersion || 0);
}

export async function claimRecitationSession(connection, {
  req,
  task,
  sessionDate,
  requestId,
}) {
  const sessionId = normalizeServerSessionId(req.body.sessionId, requestId);
  const deviceId = await ensureRecitationDeviceOwner(req, connection);
  const event = await resolveTrustedDeviceEventTime(connection, {
    deviceId,
    bootId: String(req.body.bootId || '').toLowerCase(),
    eventMonotonicMs: req.body.eventMonotonicMs,
    committedAtLocal: req.body.committedAtLocal,
    actorRole: req.auth.role,
    actorId: req.auth.id,
  });
  const submittedPlanVersion = Math.max(1, Number(req.body.planVersion || task.planVersion || 1));
  const currentPlanVersion = Math.max(1, Number(task.planVersion || submittedPlanVersion));
  const sessionType = recitationSessionTypeForTask(task);
  if (task.taskType === 'memorization') await normalizeMasterySessionIdentity(connection, task.studentId, sessionDate);
  await connection.query(
    `INSERT INTO student_quran_recitation_submissions
      (session_id, student_id, evaluator_id, evaluator_role, device_id, session_date, session_type, event_at,
       event_time_trusted, created_at_local, committed_at_local, plan_id, plan_version,
       current_plan_version, plan_snapshot_json, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), plan_snapshot_json = VALUES(plan_snapshot_json),
       updated_at = NOW(3)`,
    [
      sessionId, task.studentId, req.auth.id, req.auth.role, deviceId, sessionDate, sessionType, event.eventAt,
      event.trusted ? 1 : 0, String(req.body.createdAtLocal || '').slice(0, 40) || null,
      String(req.body.committedAtLocal || '').slice(0, 40) || null, task.planId, submittedPlanVersion,
      currentPlanVersion,
      JSON.stringify(req.body.planSnapshot || {}), JSON.stringify(req.body || {}),
    ],
  );
  let [[slot]] = await connection.query(
    `SELECT slot.session_id AS sessionId,
      DATE_FORMAT(slot.accepted_event_at, '%Y-%m-%d %H:%i:%s.%f') AS eventAt,
      slot.event_time_trusted AS eventTimeTrusted, submission.evaluator_id AS evaluatorId, submission.evaluator_role AS evaluatorRole,
      submission.plan_id AS planId, submission.current_plan_version AS planVersion,
      JSON_UNQUOTE(JSON_EXTRACT(submission.payload_json, '$.correctionOf')) AS correctionOf
     FROM student_quran_recitation_daily_slots slot
     JOIN student_quran_recitation_submissions submission ON submission.session_id = slot.session_id
     WHERE slot.student_id = ? AND slot.session_date = ? AND slot.session_type = ? FOR UPDATE`,
    [task.studentId, sessionDate, sessionType],
  );
  slot = await createOrReadRecitationSlot({ slot, connection, task, sessionDate, sessionType, sessionId, req, event });
  if (req.body.correctionOf && slot.sessionId !== sessionId) {
    await assertRecitationCorrection(connection, { req, slot, task, sessionDate, currentPlanVersion });
  }
  if (slot.sessionId !== sessionId && recitedUnderEarlierPlan(slot, task, currentPlanVersion)) {
    // The plan changed after today's recitation: the new plan gets its own session and the earlier one stays valid.
    await connection.query(
      `UPDATE student_quran_recitation_daily_slots SET session_id = ?, evaluator_id = ?,
        accepted_event_at = ?, event_time_trusted = ?
       WHERE student_id = ? AND session_date = ? AND session_type = ?`,
      [sessionId, req.auth.id, event.eventAt, event.trusted ? 1 : 0, task.studentId, sessionDate, sessionType],
    );
    await writeRecitationAudit(connection, {
      sessionId, req, deviceId, eventType: 'session_after_plan_change',
      details: { previousSessionId: slot.sessionId, sessionDate },
    });
    slot = { ...slot, sessionId };
  }
  if (slot.sessionId !== sessionId) {
    const correction = Boolean(req.body.correctionOf);
    const wins = correction || (!slot.correctionOf && recitationCandidateWins(
      { sessionId, eventAt: event.eventAt, trusted: event.trusted },
      { sessionId: slot.sessionId, eventAt: String(slot.eventAt || '').slice(0, 23), trusted: Boolean(slot.eventTimeTrusted) },
    ));
    if (!wins) {
      await connection.query(
        `UPDATE student_quran_recitation_submissions SET status = 'rejected_duplicate',
          rejection_code = 'DAILY_SESSION_EXISTS', rejection_message = ?, resolved_at = NOW(3)
         WHERE session_id = ?`,
        ['تم تسميع الطالب اليوم بالفعل.', sessionId],
      );
      await writeRecitationAudit(connection, {
        sessionId, req, deviceId, eventType: 'rejected_duplicate',
        details: { winningSessionId: slot.sessionId, sessionDate },
      });
      return { accepted: false, sessionId, winningSessionId: slot.sessionId };
    }
    await assertRecitationReplacementCoverage(connection, slot.sessionId,
      req.recitationTransaction ? req.recitationSessionTaskIds : [task.id]);
    if (req.recitationTransaction) req.recitationTransaction.superseded = true;
    await connection.query(
      `UPDATE student_quran_recitation_submissions SET status = 'rejected_duplicate',
        rejection_code = ?, rejection_message = ?, resolved_at = NOW(3)
       WHERE session_id = ?`,
      [correction ? 'TEACHER_CORRECTION' : 'EARLIER_TRUSTED_SESSION', correction ? 'استُبدل بتصحيح مشرف المسار.' : 'وصل تسميع أسبق وفق مرجع الوقت الموثوق.', slot.sessionId],
    );
    await connection.query(
      `UPDATE student_quran_recitation_attempts SET is_official = 0
       WHERE session_id = ? OR request_id LIKE ?`,
      [slot.sessionId, `${slot.sessionId}:%`],
    );
    await connection.query(
      `UPDATE student_quran_recitation_session_parts SET status = 'rejected'
       WHERE session_id = ?`,
      [slot.sessionId],
    );
    await writeRecitationAudit(connection, {
      sessionId: slot.sessionId,
      req,
      deviceId,
      eventType: correction ? 'superseded_by_teacher_correction' : 'superseded_by_earlier_session',
      details: { winningSessionId: sessionId, sessionDate },
    });
    await connection.query(
      `UPDATE student_quran_recitation_daily_slots SET session_id = ?, evaluator_id = ?,
        accepted_event_at = ?, event_time_trusted = ?
       WHERE student_id = ? AND session_date = ? AND session_type = ?`,
      [sessionId, req.auth.id, event.eventAt, event.trusted ? 1 : 0, task.studentId, sessionDate, sessionType],
    );
  }
  await writeRecitationAudit(connection, {
    sessionId, req, deviceId, eventType: 'session_claimed',
    details: {
      sessionDate,
      eventAt: event.eventAt,
      eventTimeTrusted: event.trusted,
      submittedPlanVersion,
      currentPlanVersion,
      planVersionChanged: submittedPlanVersion !== currentPlanVersion,
    },
  });
  return {
    accepted: true,
    sessionId,
    deviceId,
    eventTimeTrusted: event.trusted,
    submittedPlanVersion,
    currentPlanVersion,
  };
}

/** Claim a daily slot atomically, recovering the winner after a concurrent duplicate-key insert. */
async function createOrReadRecitationSlot({ slot, connection, task, sessionDate, sessionType, sessionId, req, event }) {
  if (!slot) {
    try {
      await connection.query(
        `INSERT INTO student_quran_recitation_daily_slots
          (student_id, session_date, session_type, session_id, evaluator_id, accepted_event_at, event_time_trusted)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [task.studentId, sessionDate, sessionType, sessionId, req.auth.id, event.eventAt, event.trusted ? 1 : 0]
      );
      slot = { sessionId };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      [[slot]] = await connection.query(
        `SELECT session_id AS sessionId,
          DATE_FORMAT(accepted_event_at, '%Y-%m-%d %H:%i:%s.%f') AS eventAt,
          event_time_trusted AS eventTimeTrusted
         FROM student_quran_recitation_daily_slots
         WHERE student_id = ? AND session_date = ? AND session_type = ? FOR UPDATE`,
        [task.studentId, sessionDate, sessionType]
      );
    }
  }
  return slot;
}

async function ensureRecitationDeviceOwner(req, connection) {
  const deviceId = isUuid(req.body.deviceId) ? String(req.body.deviceId).toLowerCase() : derivedUuid(`${req.auth.role}:${req.auth.id}`);
  await connection.query(
    `INSERT IGNORE INTO recitation_devices (device_id, actor_role, actor_id, last_seen_at)
     VALUES (?, ?, ?, NOW(3))`,
    [deviceId, req.auth.role, req.auth.id]
  );
  const [[deviceOwner]] = await connection.query(
    'SELECT actor_role AS actorRole, actor_id AS actorId FROM recitation_devices WHERE device_id = ? FOR UPDATE',
    [deviceId]
  );
  if (deviceOwner?.actorRole !== req.auth.role || Number(deviceOwner?.actorId) !== Number(req.auth.id)) {
    const error = new Error('معرّف الجهاز مرتبط بحساب آخر.');
    error.statusCode = 403;
    throw error;
  }
  return deviceId;
}

export async function finalizeRecitationTask(connection, { claim, req, task, result }) {
  await connection.query(
    `INSERT INTO student_quran_recitation_session_parts
      (session_id, task_id, task_type, payload_json, result_json, status)
     VALUES (?, ?, ?, ?, ?, 'accepted')
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), result_json = VALUES(result_json),
       status = 'accepted', updated_at = NOW(3)`,
    [claim.sessionId, task.id, task.taskType, JSON.stringify(req.body || {}), JSON.stringify(result || {})],
  );
  const expectedTaskIds = [...new Set((req.recitationSessionTaskIds?.length ? req.recitationSessionTaskIds : [task.id]).map(Number))];
  const [[parts]] = await connection.query(
    `SELECT COUNT(*) AS acceptedParts FROM student_quran_recitation_session_parts
     WHERE session_id = ? AND status = 'accepted' AND task_id IN (${expectedTaskIds.map(() => '?').join(',')})`,
    [claim.sessionId, ...expectedTaskIds],
  );
  const complete = Number(parts.acceptedParts) === expectedTaskIds.length;
  await connection.query(
    `UPDATE student_quran_recitation_submissions SET status = ?, rejection_code = NULL,
      rejection_message = NULL, resolved_at = IF(?, NOW(3), NULL) WHERE session_id = ?`,
    [complete ? 'accepted' : 'pending', complete ? 1 : 0, claim.sessionId],
  );
  await writeRecitationAudit(connection, {
    sessionId: claim.sessionId,
    req,
    deviceId: claim.deviceId,
    eventType: 'task_accepted',
    details: { taskId: task.id, taskType: task.taskType, result },
  });
}

async function writeRecitationAudit(connection, { sessionId, req, deviceId, eventType, details }) {
  await connection.query(
    `INSERT INTO student_quran_recitation_audit_log
      (session_id, event_type, actor_role, actor_id, device_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, eventType, req.auth?.role || 'system', req.auth?.id || null, deviceId || null, JSON.stringify(details || {})],
  );
}
