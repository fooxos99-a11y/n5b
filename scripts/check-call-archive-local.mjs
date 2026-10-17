import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import { getCallArchiveConfig } from '../server/services/callArchiveConfig.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const checks = [];
const probeServices = process.argv.includes('--probe-services');
const requireAi = process.argv.includes('--require-ai');
const record = (id, status, detail) => checks.push({ id, status, detail });
const runFile = promisify(execFile);

// Read only this ignored file. Never fall back to deployment or shell credentials.
let environment;
try {
  environment = dotenv.parse(await readFile(path.join(projectRoot, '.env.call-archive.local')));
} catch {
  record('local_env', 'fail', 'جهّز ملف .env.call-archive.local داخل المشروع.');
}

if (environment) {
  record('local_env', 'pass', 'تمت قراءة ملف التجربة المحلي دون عرض قيمه.');
  const config = getCallArchiveConfig(environment);
  const aiProvider = config.aiProvider || 'openai';
  record('ai_provider', config.aiProviderValid === false ? 'fail' : 'pass', `مزود التحليل المحدد: ${['openai', 'gemini'].includes(aiProvider) ? aiProvider : 'غير مدعوم'}.`);
  record('recording_opt_in', config.enabled ? 'pass' : 'fail', config.enabled
    ? 'التسجيل مفعّل في ملف التجربة.' : 'التسجيل متوقف: CALL_ARCHIVE_ENABLED ليس true.');
  record('livekit_config', config.livekit ? 'pass' : 'fail', config.livekit
    ? 'صيغة إعداد LiveKit صالحة؛ لا يثبت ذلك وجود الخدمة.' : 'يلزم LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET.');
  record('ai_key', config.aiKey ? 'pass' : 'fail', config.aiKey
    ? 'مفتاح المزود المحدد موجود؛ لم تُرسل أي تسجيلات.'
    : `يلزم ${aiProvider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} داخل ملف التجربة المحلي.`);

  if (config.storage === 'local') {
    try {
      if (!path.isAbsolute(config.localPath) || !path.isAbsolute(config.egressPath)) throw new Error('absolute_path_required');
      const resolved = await realpath(config.localPath);
      const relative = path.relative(await realpath(projectRoot), resolved);
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('private_directory_required');
      }
      if (!(await stat(resolved)).isDirectory()) throw new Error('directory_required');
      await access(resolved, constants.R_OK | constants.W_OK);
      record('private_storage', 'pass', 'مجلد التخزين قابل للقراءة والكتابة وخارج المشروع؛ تركيب Egress يحتاج فحصًا فعليًا.');
    } catch {
      record('private_storage', 'fail', 'يلزم مجلد خاص خارج المشروع، قابل للقراءة والكتابة، ومسار تركيب مطلق في Egress.');
    }
  } else {
    record('private_storage', config.s3 ? 'pass' : 'fail', config.s3
      ? 'إعداد S3 موجود؛ خصوصية الحاوية والكتابة الفعلية لم تُختبرا.' : 'إعداد تخزين S3 غير مكتمل.');
  }

  try {
    if (!path.isAbsolute(config.ffmpegPath)) throw new Error('absolute_executable_required');
    await runFile(config.ffmpegPath, ['-version'], { timeout: 10000, windowsHide: true, maxBuffer: 64 * 1024 });
    record('ffmpeg', 'pass', 'FFmpeg يعمل فعليًا.');
  } catch {
    record('ffmpeg', 'fail', 'يلزم CALL_ARCHIVE_FFMPEG_PATH لمسار FFmpeg التنفيذي الصحيح.');
  }

  const databaseScopeSafe = environment.MYSQL_HOST === '127.0.0.1'
    && environment.MYSQL_PORT === '3316' && environment.MYSQL_DATABASE === 'nukhab_calls_real_local';
  record('isolated_database_scope', databaseScopeSafe ? 'pass' : 'fail', databaseScopeSafe
    ? 'القاعدة مخصصة للتجربة على 127.0.0.1:3316.' : 'هذا الفحص يقبل قاعدة nukhab_calls_real_local على 127.0.0.1:3316 فقط.');

  if (probeServices) {
    // All service probes are read-only. Recording/transcription are separate acceptance steps.
    await Promise.all([
      (async () => {
        if (!databaseScopeSafe) return;
        let connection;
        try {
          connection = await mysql.createConnection({ host: '127.0.0.1', port: 3316,
            user: environment.MYSQL_USER, password: environment.MYSQL_PASSWORD || '',
            database: environment.MYSQL_DATABASE, connectTimeout: 5000 });
          await connection.query('SELECT 1');
          record('mysql_connection', 'pass', 'الاتصال بقاعدة التجربة نجح؛ لم يُعدّل أي مخطط أو سجل.');
        } catch {
          record('mysql_connection', 'fail', 'تعذر الاتصال بقاعدة التجربة؛ شغّل MySQL المحلي وجهّز القاعدة المعزولة.');
        } finally { await connection?.end(); }
      })(),
      (async () => {
        if (!config.livekit) return;
        const { serviceUrl, apiKey, apiSecret } = config.livekit;
        try {
          await new RoomServiceClient(serviceUrl, apiKey, apiSecret, { requestTimeout: 8 }).listRooms();
          record('livekit_connection', 'pass', 'الاتصال والمصادقة على LiveKit نجحا؛ نقل الصوت لم يُختبر.');
        } catch {
          record('livekit_connection', 'fail', 'تعذر الاتصال بـLiveKit أو المصادقة عليه.');
        }
        try {
          await new EgressClient(serviceUrl, apiKey, apiSecret, { requestTimeout: 8 }).listEgress({});
          record('egress_control_api', 'pass', 'واجهة إدارة Egress تستجيب؛ هذا لا يثبت وجود عامل تسجيل أو حفظ ملف.');
        } catch {
          record('egress_control_api', 'fail', 'واجهة إدارة Egress لا تستجيب أو لا تسمح بالمصادقة.');
        }
      })(),
      ...[...new Set([config.transcriptionModel, config.reportModel])].map(model => (async () => {
        if (!config.aiKey) return;
        const ids = [];
        if (model === config.transcriptionModel) ids.push('ai_transcription_model');
        if (model === config.reportModel) ids.push('ai_report_model');
        try {
          const url = aiProvider === 'gemini'
            ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`
            : `https://api.openai.com/v1/models/${encodeURIComponent(model)}`;
          const response = await fetch(url, {
            headers: aiProvider === 'gemini' ? { 'x-goog-api-key': config.aiKey } : { Authorization: `Bearer ${config.aiKey}` },
            signal: AbortSignal.timeout(10000), redirect: 'error',
          });
          // Never print provider bodies, headers, credentials, or errors.
          await response.body?.cancel();
          for (const id of ids) record(id, response.ok ? 'pass' : 'fail', response.ok
            ? 'النموذج متاح للمفتاح عبر Models API؛ الرصيد والتفريغ والتقرير يحتاجان تجربة فعلية.'
            : `لم يؤكد المزود الوصول إلى النموذج (HTTP ${response.status}).`);
        } catch {
          for (const id of ids) record(id, 'fail', 'تعذر فحص صلاحية الوصول إلى النموذج.');
        }
      })()),
    ]);
  }
}

const passed = ids => ids.every(id => checks.find(check => check.id === id)?.status === 'pass');
const recordingChecks = ['local_env', 'recording_opt_in', 'livekit_config', 'private_storage', 'isolated_database_scope'];
const aiChecks = ['ai_provider', 'ai_key', 'ffmpeg'];
if (probeServices) {
  recordingChecks.push('mysql_connection', 'livekit_connection', 'egress_control_api');
  aiChecks.push('ai_transcription_model', 'ai_report_model');
}

globalThis.console.log(JSON.stringify({
  mode: probeServices ? 'read_only_service_probes' : 'configuration_only',
  aiRequired: requireAi,
  checks: checks.sort((left, right) => left.id.localeCompare(right.id)),
  recordingPrerequisitesPassed: passed(recordingChecks),
  aiPrerequisitesPassed: passed(aiChecks),
  realCallVerified: false,
  notice: 'هذا فحص جاهزية فقط. قبول التشغيل يتطلب مكالمة بشرية وصوتًا محفوظًا وتقريرًا فعليًا.',
}, null, 2));
process.exitCode = !passed(recordingChecks) || (requireAi && !passed(aiChecks)) ? 1 : 0;
