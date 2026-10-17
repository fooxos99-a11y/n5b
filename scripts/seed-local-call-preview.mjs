import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { LOCAL_CALL_DATABASE, validateLocalCallEnvironment, assertLocalCallPrivateStorage } from './call-archive-local-config.mjs';

const sessionId = 'c5fb40ca-5d5a-4b0b-af34-9371ba7d8231';
const mediaIds = ['4ff3ccbd-91fe-4dab-840f-3fa4dbe25670', '4ff3ccbd-91fe-4dab-840f-3fa4dbe25671', '4ff3ccbd-91fe-4dab-840f-3fa4dbe25672'];
const runFile = promisify(execFile);

/** Additive preview data only. The launcher backs up both dedicated schemas first. */
export async function seedLocalCallPreview(pool, environment) {
  const config = validateLocalCallEnvironment(environment);
  await assertLocalCallPrivateStorage(config);
  if (config.CALL_ARCHIVE_ENABLED !== 'false' || config.CALL_ARCHIVE_S3_BUCKET) throw new Error('Preview samples require disabled recording and private local storage.');
  if (!path.isAbsolute(config.CALL_ARCHIVE_FFMPEG_PATH || '')) throw new Error('Preview audio requires an absolute FFmpeg executable path.');
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    const [[scope]] = await connection.query('SELECT DATABASE() AS name, @@port AS port');
    if (scope.name !== LOCAL_CALL_DATABASE || Number(scope.port) !== 3316) throw new Error('Preview database scope was refused.');
    const [[reciter]] = await connection.query("SELECT id,name FROM supervisors WHERE role='reciter' AND login_number='990002'");
    const [[student]] = await connection.query("SELECT id,name,committee_id FROM students WHERE login_number='990003'");
    if (!reciter || !student?.committee_id) throw new Error('Seed the dedicated demo accounts first.');
    const prefix = createHash('sha256').update(LOCAL_CALL_DATABASE).digest('hex').slice(0, 20);
    const clips = [
      { id: mediaIds[0], kind: 'mixed', identity: '', filter: 'aevalsrc=0.06*sin(2*PI*440*t)+0.06*sin(2*PI*660*t):s=16000:d=12' },
      { id: mediaIds[1], kind: 'participant', identity: `reciter:${reciter.id}`, filter: 'sine=frequency=440:sample_rate=16000:duration=12' },
      { id: mediaIds[2], kind: 'participant', identity: `student:${student.id}`, filter: 'sine=frequency=660:sample_rate=16000:duration=12' },
    ];
    for (const clip of clips) {
      clip.key = `${prefix}/call-archives/${sessionId}/${clip.id}.mp4`;
      const file = path.join(config.CALL_ARCHIVE_STORAGE_PATH, ...clip.key.split('/'));
      await mkdir(path.dirname(file), { recursive: true });
      let exists = false;
      try { exists = (await stat(file)).isFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!exists) await runFile(config.CALL_ARCHIVE_FFMPEG_PATH, ['-v', 'error', '-f', 'lavfi', '-i', clip.filter, '-c:a', 'aac', '-b:a', '48k', '-n', file], { windowsHide: true, timeout: 20000 });
      clip.bytes = (await stat(file)).size;
    }
    await connection.beginTransaction();
    transactionStarted = true;
    let archiveRoom;
    for (const [suffix, name, status] of [['open', 'غرفة المقرئ الدائمة — معاينة محلية', 'open'], ['archive', 'أرشيف توضيحي — معاينة محلية', 'closed']]) {
      const providerName = `nukhab-local-preview-${suffix}`;
      const [[existing]] = await connection.query('SELECT id,created_by_role,created_by_id FROM call_rooms WHERE livekit_room_name=?', [providerName]);
      if (existing && (existing.created_by_role !== 'reciter' || Number(existing.created_by_id) !== Number(reciter.id))) throw new Error('Preview room identity is occupied; no existing data was overwritten.');
      const id = existing?.id || (await connection.query(`INSERT INTO call_rooms(name,livekit_room_name,committee_id,status,created_by_role,created_by_id,created_by_name,closed_at)
        VALUES(?,?,?,?,'reciter',?,?,?)`, [name, providerName, student.committee_id, status, reciter.id, reciter.name, status === 'closed' ? new Date() : null]))[0].insertId;
      if (suffix === 'archive') archiveRoom = id;
    }
    const endedAt = new Date(), startedAt = new Date(endedAt.getTime() - 12000);
    const report = { summary: 'هذا نموذج محلي لعرض الأرشيف والتقرير فقط. لم تجرِ مكالمة بشرية ولم ينتج هذا التقرير من خدمة ذكاء اصطناعي.',
      passage: 'مقطع توضيحي', observations: [
        { id: 'observation-1', atSeconds: 2, endSeconds: 4, speaker: 'Speaker 1', category: 'possible_error', detail: 'موضع توضيحي لتجربة مراجعة المقرئ واعتماد الملاحظة.', correction: 'مثال لطلب إعادة الموضع.', response: 'مثال لإعادة القراءة.', confidence: 'medium' },
        { id: 'observation-2', atSeconds: 6, endSeconds: 8, speaker: 'Speaker 2', category: 'teacher_correction', detail: 'مثال لتوجيه المقرئ أثناء الجلسة.', correction: '', response: '', confidence: 'medium' },
      ], followUp: ['جرّب الاستماع إلى توقيت الملاحظة وحفظ المراجعة.'], limitations: ['الملفات نغمات مولّدة محليًا وليست تلاوة أو تسجيلًا لأشخاص.', 'التقرير بيانات توضيحية ولا يثبت دقة التحليل.'] };
    const [[existingSession]] = await connection.query('SELECT room_id,owner_id FROM call_archive_sessions WHERE id=?', [sessionId]);
    if (existingSession && (Number(existingSession.room_id) !== Number(archiveRoom) || Number(existingSession.owner_id) !== Number(reciter.id))) throw new Error('Preview archive identity is occupied.');
    await connection.query(`INSERT IGNORE INTO call_archive_sessions(id,room_id,livekit_room_name,room_name,committee_name,owner_role,owner_id,state,report_state,started_at,ended_at,recording_ready_at,report_json)
      VALUES(?,?,?,'أرشيف توضيحي — معاينة محلية','حلقة اختبار المكالمات المحلي','reciter',?,'ready','ready',?,?,?,?)`,
    [sessionId, archiveRoom, 'nukhab-local-preview-archive', reciter.id, startedAt, endedAt, startedAt, JSON.stringify(report)]);
    for (const person of [{ role: 'reciter', ...reciter }, { role: 'student', ...student }]) {
      await connection.query(`INSERT IGNORE INTO call_archive_participants(session_id,identity,user_role,user_id,user_name,consented_at,joined_at,left_at) VALUES(?,?,?,?,?,?,?,?)`,
        [sessionId, `${person.role}:${person.id}`, person.role, person.id, person.name, startedAt, startedAt, endedAt]);
    }
    for (const clip of clips) await connection.query(`INSERT IGNORE INTO call_archive_media(id,session_id,kind,identity,track_id,object_key,storage,state,mime,bytes,duration_seconds,started_at,ended_at)
      VALUES(?,?,?,?,?,?,'local','ready','audio/mp4',?,12,?,?)`, [clip.id, sessionId, clip.kind, clip.identity, clip.kind === 'mixed' ? '' : `preview-${clip.id}`, clip.key, clip.bytes, startedAt, endedAt]);
    await connection.commit();
    transactionStarted = false;
    console.log(JSON.stringify({ previewSeeded: true, archiveRoomId: String(archiveRoom), sessionId, syntheticAudio: true, realCall: false }));
  } catch (error) { if (transactionStarted) await connection.rollback(); throw error; }
  finally { connection.release(); }
}
