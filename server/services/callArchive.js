import crypto from 'node:crypto';
import { db, getDatabaseContext } from '../db.js';
import { hasSupervisorDashboardPermission } from './dashboardPermissions.js';
import { getCallArchiveConfig, callArchiveCapabilities } from './callArchiveConfig.js';
import { createCallArchiveProvider, verifiedHumanParticipant } from './callArchiveProvider.js';
import { createCallArchiveStorage } from './callArchiveStorage.js';
import { transcribeCallArchive, summarizeCallArchive } from './callArchiveAI.js';
import { transcribeCallArchiveChunks } from './callArchiveChunks.js';

const safeError = error => error?.code === 'AUDIO_TOO_LARGE' ? error.message
  : error?.code === 'CHUNKER_UNCONFIGURED' ? error.message
  : error?.code === 'AI_UNCONFIGURED' ? 'خدمة التحليل الآلي غير مهيأة.' : 'تعذر إكمال التسجيل أو التحليل. ستُعاد المحاولة تلقائيًا، ويمكن للإدارة مراجعة إعدادات الخدمة.';
const parseJson = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const iso = value => value ? new Date(value).toISOString() : null;
const contextKey = () => crypto.createHash('sha256').update(getDatabaseContext().databaseName).digest('hex').slice(0, 20);

/** Named locks serialize across API instances and workers, not just this process. */
async function locked(key, action, pool = db()) {
  const connection = await pool.getConnection();
  const name = `call-archive:${contextKey()}:${key}`.slice(0, 64);
  let acquired = false;
  try {
    const [[row]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [name]);
    acquired = Number(row.acquired) === 1;
    if (!acquired) return null;
    return await action(connection);
  } finally { if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [name]); connection.release(); }
}

async function queue(connection, id, kind) {
  await connection.query(`INSERT INTO call_archive_jobs (session_id, kind) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE attempts=IF(state='done',0,attempts),
    next_at=IF(state='done',CURRENT_TIMESTAMP(3),next_at),state=IF(state='done','pending',state)`, [id, kind]);
}

export function assertCallArchiveAvailable() {
  const config = getCallArchiveConfig();
  if (config.joinPaused) throw Object.assign(new Error('يجري تجهيز تسجيل المكالمات. حاول الدخول بعد قليل.'), { statusCode: 503, code: 'call_recording_setup' });
  return callArchiveCapabilities(config);
}

async function enroll(connection, sessionId, humans) {
  for (const human of humans) {
    await connection.query(`INSERT INTO call_archive_participants
      (session_id,identity,user_role,user_id,user_name,connection_sid,consented_at,joined_at)
      VALUES (?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE user_name=VALUES(user_name),connection_sid=VALUES(connection_sid),left_at=NULL`,
    [sessionId, human.identity, human.role, human.id, human.name, human.connectionSid || null]);
  }
  const identities = humans.map(person => person.identity);
  await connection.query(`UPDATE call_archive_participants SET left_at=COALESCE(left_at,CURRENT_TIMESTAMP(3))
    WHERE session_id=? ${identities.length ? `AND identity NOT IN (${identities.map(() => '?').join(',')})` : ''}`, [sessionId, ...identities]);
}

async function newMedia(connection, session, kind, identity = '', trackId = '') {
  const id = crypto.randomUUID();
  await connection.query(`INSERT IGNORE INTO call_archive_media (id,session_id,kind,identity,track_id,object_key,storage)
    VALUES (?,?,?,?,?,?,?)`, [id, session.id, kind, identity, trackId,
    `${contextKey()}/call-archives/${session.id}/${id}.mp4`, getCallArchiveConfig().storage]);
}

export async function reconcileCallArchivePresence(roomName, options = {}) {
  const config = options.config || getCallArchiveConfig();
  if (!config.configured || !roomName) return;
  const provider = options.provider || createCallArchiveProvider(config);
  return locked(crypto.createHash('sha256').update(roomName).digest('hex').slice(0, 20), async connection => {
    const [[room]] = await connection.query(`SELECT r.*, c.name AS committee_name FROM call_rooms r
      LEFT JOIN committees c ON c.id=r.committee_id WHERE r.livekit_room_name=? LIMIT 1`, [roomName]);
    let [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE livekit_room_name=? AND active_room_id IS NOT NULL LIMIT 1', [roomName]);
    if (!room || room.status !== 'open') {
      if (session && session.state !== 'stopping') await markStopping(connection, session);
      return;
    }
    const humans = await provider.presence(roomName);
    if (session) {
      for (const info of await provider.list(roomName)) await applyCallArchiveEgress(info, { pool: connection });
      [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE id=? AND active_room_id IS NOT NULL', [session.id]);
    }
    if (session) {
      const [previous] = await connection.query('SELECT identity,connection_sid FROM call_archive_participants WHERE session_id=? AND left_at IS NULL', [session.id]);
      const departure = options.departure && verifiedHumanParticipant(options.departure);
      // A full reconnect can happen between presence polls. Compare connection
      // IDs, not microphone tracks; delayed duplicate departures cannot end the
      // replacement connection's archive.
      const pairChanged = previous.length === 2 && previous.some(person => person.connection_sid && (
        (departure?.connectionSid === person.connection_sid && departure.identity === person.identity)
        || humans.some(human => human.identity === person.identity && human.connectionSid && human.connectionSid !== person.connection_sid)
      ));
      if (humans.length < 2 || pairChanged) {
        await markStopping(connection, session);
        await stopRecordingMedia(connection, session, provider);
        session = null;
      }
    }
    if (!session && humans.length >= 2) {
      const id = crypto.randomUUID();
      await connection.query(`INSERT INTO call_archive_sessions
        (id,room_id,active_room_id,livekit_room_name,room_name,committee_name,owner_role,owner_id,started_at)
        VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))`, [id, room.id, room.id, roomName, room.name, room.committee_name, room.created_by_role, room.created_by_id]);
      await connection.query('UPDATE call_archive_sessions SET recording_gap=1 WHERE id=?', [id]);
      [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE id=?', [id]);
      await newMedia(connection, session, 'mixed');
    }
    if (!session) return;
    await enroll(connection, session.id, humans);
    if (Date.now() - new Date(session.started_at).getTime() > config.maxSessionMs) {
      await connection.query('UPDATE call_archive_sessions SET recording_gap=1,last_error=? WHERE id=?', ['بلغ التسجيل حد الجلسة؛ ستبدأ جلسة جديدة إذا استمرت المكالمة.', session.id]);
      await markStopping(connection, session); return;
    }
    for (const human of humans) for (const trackId of human.tracks || []) await newMedia(connection, session, 'participant', human.identity, trackId);
    const [[pending]] = await connection.query("SELECT COUNT(*) AS count FROM call_archive_media WHERE session_id=? AND state='pending'", [session.id]);
    if (Number(pending.count)) await queue(connection, session.id, 'capture');
  });
}

async function markStopping(connection, session) {
  await connection.query("UPDATE call_archive_sessions SET active_room_id=NULL,state='stopping',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP(3)) WHERE id=?", [session.id]);
  await connection.query('UPDATE call_archive_participants SET left_at=COALESCE(left_at,CURRENT_TIMESTAMP(3)) WHERE session_id=?', [session.id]);
  await queue(connection, session.id, 'stop');
}

export async function finishCallArchiveRoom(roomName) {
  return locked(crypto.createHash('sha256').update(roomName).digest('hex').slice(0, 20), async connection => {
    const [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE livekit_room_name=? AND active_room_id IS NOT NULL LIMIT 1', [roomName]);
    if (session) await markStopping(connection, session);
  });
}

export async function applyCallArchiveEgress(info, options = {}) {
  if (!info?.egressId) return;
  const pool = options.pool || db();
  const [[media]] = await pool.query('SELECT * FROM call_archive_media WHERE egress_id=? LIMIT 1', [info.egressId]);
  if (!media) return;
  const status = Number(info.status), result = info.fileResults?.[0];
  if (status === 1) {
    await pool.query("UPDATE call_archive_media SET state='recording',started_at=COALESCE(started_at,CURRENT_TIMESTAMP(3)) WHERE id=? AND state IN ('pending','starting')", [media.id]);
    if (media.kind === 'mixed') await pool.query("UPDATE call_archive_sessions SET state='recording',recording_ready_at=COALESCE(recording_ready_at,CURRENT_TIMESTAMP(3)) WHERE id=? AND active_room_id IS NOT NULL AND state IN ('starting','recording','failed')", [media.session_id]);
  }
  if (status >= 3) {
    const complete = status === 3 && result && Number(result.size) > 0;
    await pool.query(`UPDATE call_archive_media SET state=?,bytes=?,duration_seconds=?,ended_at=CURRENT_TIMESTAMP(3),last_error=? WHERE id=?`,
      [complete ? 'ready' : 'failed', result ? Number(result.size) : null, result ? Number(result.duration || 0) / 1e9 : null,
        complete ? null : 'تعذر إكمال هذا المسار الصوتي.', media.id]);
    if (!complete) await pool.query('UPDATE call_archive_sessions SET recording_gap=1,last_error=? WHERE id=?', ['يوجد مسار صوتي لم يكتمل تسجيله.', media.session_id]);
    if (media.kind === 'mixed') {
      const [[session]] = await pool.query('SELECT * FROM call_archive_sessions WHERE id=?', [media.session_id]);
      if (session.active_room_id && !['stopping', 'processing', 'ready', 'failed'].includes(session.state)) await markStopping(pool, session);
    }
  }
}

export async function handleCallArchiveWebhook(event) {
  if (!getCallArchiveConfig().enabled) return;
  if (event.egressInfo) await applyCallArchiveEgress(event.egressInfo);
  if (['participant_joined', 'participant_left', 'participant_connection_aborted', 'track_published', 'track_unpublished', 'room_started', 'room_finished'].includes(event.event)) {
    await reconcileCallArchivePresence(event.room?.name, {
      departure: ['participant_left', 'participant_connection_aborted'].includes(event.event) ? event.participant : null,
    });
  }
}

async function captureSession(connection, session, provider) {
  [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE id=?', [session.id]);
  if (['stopping', 'processing', 'ready', 'failed'].includes(session.state)) return;
  const humans = await provider.presence(session.livekit_room_name);
  if (humans.length < 2) {
    await markStopping(connection, session);
    await stopRecordingMedia(connection, session, provider);
    return;
  }
  const existing = await provider.list(session.livekit_room_name);
  const [mediaRows] = await connection.query("SELECT * FROM call_archive_media WHERE session_id=? AND state IN ('pending','failed','starting')", [session.id]);
  for (const media of mediaRows) {
    if (media.kind === 'participant' && !humans.some(person => person.identity === media.identity && person.tracks.includes(media.track_id))) {
      await connection.query("UPDATE call_archive_media SET state='failed',last_error=? WHERE id=?", ['انتهى المسار قبل بدء التسجيل.', media.id]);
      continue;
    }
    // Stable output keys recover an external start after a process crash or
    // timeout, without starting the same capture a second time.
    let info = existing.find(item => JSON.stringify(item.toJson ? item.toJson() : item, (_, value) => typeof value === 'bigint' ? value.toString() : value).includes(media.id));
    if (!info && media.egress_id) info = existing.find(item => item.egressId === media.egress_id);
    if (!info) {
      await connection.query("UPDATE call_archive_media SET state='starting',last_error=NULL WHERE id=?", [media.id]);
      info = await provider.start(session.livekit_room_name, media);
    }
    await connection.query('UPDATE call_archive_media SET egress_id=?,state=? WHERE id=?', [info.egressId, Number(info.status) === 1 ? 'recording' : 'starting', media.id]);
    await applyCallArchiveEgress(info, { pool: connection });
  }
}

async function stopRecordingMedia(connection, session, provider) {
  const egresses = await provider.list(session.livekit_room_name);
  for (const info of egresses) await applyCallArchiveEgress(info, { pool: connection });
  const [rows] = await connection.query('SELECT * FROM call_archive_media WHERE session_id=?', [session.id]);
  let waiting = false;
  for (const media of rows) {
    if (media.egress_id && ['recording', 'starting'].includes(media.state)) {
      const info = egresses.find(info => info.egressId === media.egress_id);
      if (info && Number(info.status) < 2) await applyCallArchiveEgress(await provider.stop(media.egress_id), { pool: connection });
      if (session.ended_at && Date.now() - new Date(session.ended_at).getTime() > 600000) {
        await connection.query("UPDATE call_archive_media SET state='failed',last_error=? WHERE id=?", ['لم تؤكد خدمة التسجيل اكتمال الملف خلال المهلة.', media.id]);
        continue;
      }
      waiting = true;
    } else if (media.state === 'pending') {
      await connection.query("UPDATE call_archive_media SET state='failed',last_error=? WHERE id=?", ['لم يبدأ تسجيل هذا المسار قبل انتهاء الجلسة.', media.id]);
    }
  }
  return waiting;
}

async function stopSession(connection, session, provider, storage, config) {
  const waiting = await stopRecordingMedia(connection, session, provider);
  if (waiting) throw Object.assign(new Error('Waiting for recording finalization'), { code: 'EGRESS_PENDING' });
  const [[mixed]] = await connection.query("SELECT * FROM call_archive_media WHERE session_id=? AND kind='mixed' AND state='ready' LIMIT 1", [session.id]);
  if (!mixed) throw new Error('Mixed recording is unavailable');
  const details = await storage.head(mixed);
  if (!details.length) throw new Error('Recording is empty');
  await connection.query('UPDATE call_archive_media SET bytes=? WHERE id=?', [details.length, mixed.id]);
  await connection.query("UPDATE call_archive_sessions SET active_room_id=NULL,state='processing',report_state=?,ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP(3)) WHERE id=?", [config.aiKey ? 'pending' : 'unconfigured', session.id]);
  await connection.query('UPDATE call_archive_participants SET left_at=COALESCE(left_at,CURRENT_TIMESTAMP(3)) WHERE session_id=?', [session.id]);
  if (config.aiKey) await queue(connection, session.id, 'report');
  else await connection.query("UPDATE call_archive_sessions SET state='ready' WHERE id=?", [session.id]);
}

async function reportSession(connection, session, storage, config, ai) {
  const [[mixed]] = await connection.query("SELECT * FROM call_archive_media WHERE session_id=? AND kind='mixed' AND state='ready' LIMIT 1", [session.id]);
  if (!mixed) throw new Error('Recording unavailable');
  await connection.query("UPDATE call_archive_sessions SET report_state='processing' WHERE id=?", [session.id]);
  let transcript = parseJson(session.transcript_json);
  if (!transcript) {
    transcript = await transcribeCallArchiveChunks(mixed, storage, config, ai.transcribe);
    await connection.query('UPDATE call_archive_sessions SET transcript_json=? WHERE id=?', [JSON.stringify(transcript), session.id]);
  }
  const duration = Number(mixed.duration_seconds) || Math.max(0, (new Date(session.ended_at) - new Date(session.started_at)) / 1000);
  const report = await ai.summarize(transcript, duration, config);
  await connection.query("UPDATE call_archive_sessions SET state='ready',report_state='ready',report_json=?,last_error=NULL WHERE id=?", [JSON.stringify(report), session.id]);
}

export async function processCallArchiveBatch(options = {}) {
  const config = options.config || getCallArchiveConfig();
  if (!config.configured) return { processed: 0 };
  const kinds = [...new Set(options.kinds || ['capture', 'stop', 'report'])];
  if (!kinds.length || kinds.some(kind => !['capture', 'stop', 'report'].includes(kind))) throw new Error('Invalid call archive worker job kinds.');
  const provider = options.provider || createCallArchiveProvider(config), storage = options.storage || createCallArchiveStorage(config);
  const ai = options.ai || { transcribe: transcribeCallArchive, summarize: summarizeCallArchive };
  // Polling recovers missed webhooks; signed departures also preserve short
  // participant-count boundaries between polls.
  if (options.reconcile !== false) {
    const [rooms] = await db().query(`SELECT livekit_room_name FROM call_rooms WHERE status='open'
      UNION SELECT livekit_room_name FROM call_archive_sessions WHERE active_room_id IS NOT NULL`);
    for (const room of rooms) {
      try { await reconcileCallArchivePresence(room.livekit_room_name, { config, provider }); }
      catch {
        await db().query('UPDATE call_archive_sessions SET recording_gap=1,last_error=? WHERE livekit_room_name=? AND active_room_id IS NOT NULL',
          ['تعذر التحقق من حضور هذه الغرفة؛ ستُعاد المحاولة دون إيقاف معالجة بقية الأرشيف.', room.livekit_room_name]);
      }
    }
  }
  const [jobs] = await db().query(`SELECT * FROM call_archive_jobs WHERE
    ((state='pending' AND next_at<=CURRENT_TIMESTAMP(3)) OR (state='running' AND lease_until<CURRENT_TIMESTAMP(3)))
    AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY id LIMIT 10`, kinds);
  let processed = 0;
  for (const job of jobs) {
    await locked(`job:${job.id}`, async connection => {
      const token = crypto.randomUUID();
      const [claim] = await connection.query(`UPDATE call_archive_jobs SET state='running',lease_token=?,lease_until=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 10 MINUTE),attempts=attempts+1
        WHERE id=? AND ((state='pending' AND next_at<=CURRENT_TIMESTAMP(3)) OR (state='running' AND lease_until<CURRENT_TIMESTAMP(3)))`, [token, job.id]);
      if (!claim.affectedRows) return;
      const [[session]] = await connection.query('SELECT * FROM call_archive_sessions WHERE id=?', [job.session_id]);
      try {
        if (job.kind === 'capture' || job.kind === 'stop') {
          const result = await locked(crypto.createHash('sha256').update(session.livekit_room_name).digest('hex').slice(0, 20), roomConnection => job.kind === 'capture'
            ? captureSession(roomConnection, session, provider) : stopSession(roomConnection, session, provider, storage, config));
          if (result === null) throw Object.assign(new Error('Room is being reconciled by another worker'), { code: 'EGRESS_PENDING' });
        }
        else if (job.kind === 'report') await reportSession(connection, session, storage, config, ai);
        await connection.query("UPDATE call_archive_jobs SET state='done',lease_until=NULL,last_error=NULL WHERE id=? AND lease_token=?", [job.id, token]);
      } catch (error) {
        const final = Number(job.attempts) + 1 >= 5 && error.code !== 'EGRESS_PENDING';
        const delaySeconds = error.code === 'EGRESS_PENDING' ? 5 : Math.min(300, 5 * 2 ** Number(job.attempts));
        await connection.query(`UPDATE call_archive_jobs SET state=?,lease_until=NULL,last_error=?,next_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ? SECOND) WHERE id=? AND lease_token=?`,
          [final ? 'failed' : 'pending', safeError(error), delaySeconds, job.id, token]);
        if (error.code !== 'EGRESS_PENDING') {
          await connection.query('UPDATE call_archive_sessions SET last_error=?,recording_gap=IF(?=\'capture\',1,recording_gap) WHERE id=?', [safeError(error), job.kind, session.id]);
          if (job.kind === 'report') await connection.query('UPDATE call_archive_sessions SET report_state=? WHERE id=?', [final ? 'failed' : 'pending', session.id]);
          if (final && job.kind === 'capture') {
            const [[mixed]] = await connection.query("SELECT 1 AS active FROM call_archive_media WHERE session_id=? AND kind='mixed' AND state='recording' LIMIT 1", [session.id]);
            // A failed recorder stays attached until explicit retry/end. This
            // prevents creating an unbounded series of failed archive sessions.
            await connection.query('UPDATE call_archive_sessions SET state=?,report_state=? WHERE id=? AND active_room_id IS NOT NULL AND state<>\'stopping\'',
              [mixed ? 'recording' : 'failed', mixed ? 'pending' : 'failed', session.id]);
          }
          if (final && job.kind === 'stop') await connection.query("UPDATE call_archive_sessions SET state='failed',report_state='failed',active_room_id=NULL,ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP(3)) WHERE id=?", [session.id]);
        }
      }
      processed++;
    });
  }
  await db().query('DELETE FROM call_archive_playback_grants WHERE expires_at<CURRENT_TIMESTAMP(3)');
  return { processed };
}

export async function canManageCallArchive(auth) {
  return auth?.role === 'manager'
    || (auth?.role === 'admin' && await hasSupervisorDashboardPermission(auth.id, 'calls'));
}

export async function canAccessCallArchive(auth, session) {
  return Boolean(session) && await canManageCallArchive(auth);
}

/** Room ownership and participation never grant archive access. */
export async function callArchiveSqlScope(auth) {
  return { sql: await canManageCallArchive(auth) ? '1=1' : '1=0', params: [] };
}

export async function canReviewCallArchive(auth, session) {
  return canAccessCallArchive(auth, session);
}

export async function getCallArchiveRoomStates(ids) {
  const config = getCallArchiveConfig(), base = { ...callArchiveCapabilities(config), state: config.configured ? 'waiting' : 'unconfigured', sessionId: null, readyAt: null, recordingGap: false, lastError: null };
  const result = Object.fromEntries(ids.map(id => [String(id), { ...base }]));
  if (!ids.length || !config.enabled) return result;
  const [rows] = await db().query(`SELECT room_id,id,state,recording_ready_at,recording_gap,last_error FROM call_archive_sessions WHERE active_room_id IN (${ids.map(() => '?').join(',')})`, ids);
  for (const row of rows) result[String(row.room_id)] = { ...base, state: row.state, sessionId: row.id, readyAt: iso(row.recording_ready_at), recordingGap: Boolean(row.recording_gap), lastError: row.last_error };
  return result;
}

export function publicCallArchiveSession(row) {
  return { id: row.id, roomId: String(row.room_id), roomName: row.room_name, committeeName: row.committee_name,
    state: row.state, active: Boolean(row.active_room_id), reportState: row.report_state, startedAt: iso(row.started_at), endedAt: iso(row.ended_at),
    recordingReadyAt: iso(row.recording_ready_at), recordingGap: Boolean(row.recording_gap), lastError: row.last_error };
}

export { parseJson as parseCallArchiveJson, queue as queueCallArchiveJob };
