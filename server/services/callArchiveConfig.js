import path from 'node:path';
import { resolveLiveKitConfig } from './livekitConfig.js';

export const GEMINI_ARCHIVE_MAX_AUDIO_BYTES = 13 * 1024 * 1024;
export function getCallArchiveConfig(environment = process.env) {
  const aiProvider = String(environment.CALL_ARCHIVE_AI_PROVIDER || 'openai').trim().toLowerCase();
  const aiProviderValid = ['openai', 'gemini'].includes(aiProvider);
  const providerAudioLimit = aiProvider === 'gemini' ? GEMINI_ARCHIVE_MAX_AUDIO_BYTES : 24 * 1024 * 1024;
  const defaultTranscriptionModel = aiProvider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4o-transcribe-diarize';
  const defaultReportModel = aiProvider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4.1-mini';
  const enabled = environment.CALL_ARCHIVE_ENABLED === 'true';
  const localPath = String(environment.CALL_ARCHIVE_STORAGE_PATH || '').trim();
  const bucket = String(environment.CALL_ARCHIVE_S3_BUCKET || '').trim();
  const storage = bucket ? 's3' : 'local';
  const egressPath = environment.CALL_ARCHIVE_EGRESS_PATH || localPath;
  const s3 = bucket && environment.CALL_ARCHIVE_S3_ACCESS_KEY_ID && environment.CALL_ARCHIVE_S3_SECRET_ACCESS_KEY ? {
    bucket, region: environment.CALL_ARCHIVE_S3_REGION || 'auto',
    endpoint: environment.CALL_ARCHIVE_S3_ENDPOINT || undefined,
    accessKey: environment.CALL_ARCHIVE_S3_ACCESS_KEY_ID,
    secret: environment.CALL_ARCHIVE_S3_SECRET_ACCESS_KEY,
    forcePathStyle: environment.CALL_ARCHIVE_S3_FORCE_PATH_STYLE === 'true',
  } : null;
  const storageReady = storage === 's3' ? Boolean(s3) : path.isAbsolute(localPath) && path.isAbsolute(egressPath);
  const livekit = resolveLiveKitConfig(environment);
  return {
    enabled, configured: Boolean(enabled && storageReady && livekit), storage, s3,
    joinPaused: environment.CALL_ARCHIVE_JOIN_PAUSED === 'true',
    localPath, egressPath, livekit,
    rejoinGraceMs: Math.max(1000, Math.min(30000, Number(environment.CALL_ARCHIVE_REJOIN_GRACE_MS) || 8000)),
    maxSessionMs: Math.max(300000, Math.min(86400000, Number(environment.CALL_ARCHIVE_MAX_SESSION_MS) || 4 * 3600000)),
    maxAiBytes: Math.min(providerAudioLimit, Math.max(1024, Number(environment.CALL_ARCHIVE_AI_MAX_BYTES) || providerAudioLimit)),
    ffmpegPath: String(environment.CALL_ARCHIVE_FFMPEG_PATH || '').trim(),
    aiProvider, aiProviderValid,
    aiKey: aiProviderValid ? String((aiProvider === 'gemini' ? environment.GEMINI_API_KEY : environment.OPENAI_API_KEY) || '').trim() : '',
    transcriptionModel: aiProviderValid ? environment.CALL_ARCHIVE_TRANSCRIPTION_MODEL || defaultTranscriptionModel : '',
    reportModel: aiProviderValid ? environment.CALL_ARCHIVE_REPORT_MODEL || defaultReportModel : '',
  };
}

export function callArchiveCapabilities(config = getCallArchiveConfig()) {
  return { enabled: config.enabled, configured: config.configured,
    consentRequired: false, aiConfigured: Boolean(config.aiKey),
    message: config.configured ? null : 'الأرشفة الصوتية غير مهيأة. لن يبدأ تسجيل قبل إعداد خدمة التسجيل والتخزين الخاص.' };
}
