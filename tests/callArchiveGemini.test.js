import test from 'node:test';
import assert from 'node:assert/strict';
import { getCallArchiveConfig, GEMINI_ARCHIVE_MAX_AUDIO_BYTES } from '../server/services/callArchiveConfig.js';
import { transcribeCallArchive, summarizeCallArchive } from '../server/services/callArchiveAI.js';
import { validateGeminiArchiveTranscript } from '../server/services/callArchiveGemini.js';
import { transcribeCallArchiveChunks } from '../server/services/callArchiveChunks.js';

const selected = overrides => getCallArchiveConfig({ CALL_ARCHIVE_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'mock-gemini-private-key', ...overrides });
const transcript = { text: 'أعد هذا الموضع. نعم.', segments: [{ start: 1, end: 5, speaker: 'Speaker 1', text: 'أعد هذا الموضع.' },
  { start: 6, end: 8, speaker: 'Speaker 2', text: 'نعم.' }] };
const report = { summary: 'طلب المقرئ إعادة موضع.', passage: '', observations: [{ id: 'provider-id', atSeconds: 2, endSeconds: 4,
  speaker: 'Speaker 1', category: 'possible_error', detail: 'موضع يحتاج مراجعة.', correction: 'إعادة الموضع.', response: 'أعاد.', confidence: 'medium' }], followUp: ['مراجعة الموضع.'], limitations: ['يحتاج اعتماد المقرئ.'] };
const success = value => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test('AI provider selection preserves OpenAI default, selects Gemini explicitly, and never falls back to another key', () => {
  const original = getCallArchiveConfig({ OPENAI_API_KEY: 'mock-openai', GEMINI_API_KEY: 'mock-gemini' });
  assert.equal(original.aiProvider, 'openai'); assert.equal(original.aiKey, 'mock-openai');
  assert.equal(original.transcriptionModel, 'gpt-4o-transcribe-diarize'); assert.equal(original.reportModel, 'gpt-4.1-mini');
  const gemini = selected({ OPENAI_API_KEY: 'mock-openai' });
  assert.equal(gemini.aiKey, 'mock-gemini-private-key'); assert.equal(gemini.aiProviderValid, true);
  assert.equal(gemini.transcriptionModel, 'gemini-3.5-flash-lite'); assert.equal(gemini.reportModel, 'gemini-3.5-flash-lite');
  assert.equal(selected({ GEMINI_API_KEY: '', OPENAI_API_KEY: 'wrong-provider' }).aiKey, '');
  const overridden = selected({ CALL_ARCHIVE_TRANSCRIPTION_MODEL: 'gemini-model-one', CALL_ARCHIVE_REPORT_MODEL: 'gemini-model-two' });
  assert.equal(overridden.transcriptionModel, 'gemini-model-one'); assert.equal(overridden.reportModel, 'gemini-model-two');
});

test('unsupported provider fails closed without sending audio or using another configured key', async () => {
  const config = selected({ CALL_ARCHIVE_AI_PROVIDER: 'typo-provider', OPENAI_API_KEY: 'mock-other' });
  assert.equal(config.aiProviderValid, false); assert.equal(config.aiKey, '');
  const unexpected = async () => { throw new Error('No provider should be called'); };
  await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), config, unexpected), error => error.code === 'AI_PROVIDER_UNSUPPORTED');
  await assert.rejects(() => summarizeCallArchive(transcript, 10, config, unexpected), error => error.code === 'AI_PROVIDER_UNSUPPORTED');
});

test('Gemini configuration clamps inline audio to 13MiB, leaving room for base64 in a request below20MB', () => {
  assert.equal(selected().maxAiBytes, GEMINI_ARCHIVE_MAX_AUDIO_BYTES);
  assert.equal(selected({ CALL_ARCHIVE_AI_MAX_BYTES: String(99 * 1024 * 1024) }).maxAiBytes, GEMINI_ARCHIVE_MAX_AUDIO_BYTES);
  assert.equal(selected({ CALL_ARCHIVE_AI_MAX_BYTES: '2048' }).maxAiBytes, 2048);
  assert.equal(getCallArchiveConfig({}).maxAiBytes, 24 * 1024 * 1024);
});

test('Gemini diarized transcription uses header-only credentials, inline audio, explicit JSON schema, no files and no model account guesses', async () => {
  const config = selected();
  const result = await transcribeCallArchive(Buffer.from('mocked audio-only mp4'), config, async (url, request) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(new URL(url).search, ''); assert.equal(request.headers['x-goog-api-key'], config.aiKey);
    assert.equal(request.body.includes(config.aiKey), false); assert.equal(request.redirect, 'error');
    const body = JSON.parse(request.body);
    assert.equal(body.store, false); assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false); assert.equal(body.generationConfig.maxOutputTokens, 65536);
    const audio = body.contents[0].parts[1].inlineData;
    assert.equal(audio.mimeType, 'audio/m4a'); assert.equal(Buffer.from(audio.data, 'base64').toString(), 'mocked audio-only mp4');
    assert.equal(body.contents[0].parts.some(part => part.fileData), false);
    return success({ ...transcript, segments: [{ ...transcript.segments[0], speaker: 'student:123' }, transcript.segments[1]] });
  }, { mime: 'audio/mp4', durationSeconds: 10 });
  assert.equal(result.segments[0].speaker, 'Unknown speaker'); assert.equal(result.segments[1].speaker, 'Speaker 2');
});

test('Gemini report uses text only after transcription and preserves probable errors for the unchanged manual review flow', async () => {
  const result = await summarizeCallArchive(transcript, 10, selected(), async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.ok(body.contents[0].parts.every(part => typeof part.text === 'string'));
    assert.equal(body.generationConfig.responseJsonSchema.properties.observations.items.additionalProperties, false);
    return success(report);
  });
  assert.equal(result.observations[0].id, 'observation-1'); assert.equal(result.observations[0].category, 'possible_error');
  assert.equal(result.observations[0].speaker, 'Speaker 1'); assert.equal(result.approvedErrors, undefined);
  const guessed = await summarizeCallArchive(transcript, 10, selected(), async () => success({ ...report, observations: [{ ...report.observations[0], speaker: 'حساب الطالب رقم123' }] }));
  assert.equal(guessed.observations[0].speaker, 'Unknown speaker');
});

test('Gemini failures expose only sanitized HTTP status, never provider response bodies or secrets', async () => {
  let bodyRead = false, cancelled = false;
  await assert.rejects(() => transcribeCallArchive(Buffer.from('mock'), selected(), async () => ({ ok: false, status: 403,
    body: { cancel: async () => { cancelled = true; } }, json: async () => { bodyRead = true; return { key: 'should-not-be-read' }; } })),
  error => error.code === 'GEMINI_403' && !error.message.includes('should-not-be-read'));
  assert.equal(bodyRead, false); assert.equal(cancelled, true);
  await assert.rejects(() => transcribeCallArchive(Buffer.from('mock'), selected(), async () => { throw new Error('network mock-gemini-private-key'); }),
    error => error.code === 'GEMINI_NETWORK' && !error.message.includes('mock-gemini-private-key'));
});

test('Gemini missing key rejects both analysis steps before any request', async () => {
  const config = selected({ GEMINI_API_KEY: '' });
  const unexpected = async () => { throw new Error('No request expected'); };
  await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), config, unexpected), error => error.code === 'AI_UNCONFIGURED');
  await assert.rejects(() => summarizeCallArchive(transcript, 10, config, unexpected), error => error.code === 'AI_UNCONFIGURED');
});

test('Gemini rejects blocked, incomplete, missing and multiple candidates rather than accepting partial transcription', async () => {
  for (const result of [{ promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [] },
    ...['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER'].map(finishReason => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(transcript) }] } }] })),
    { candidates: [{ finishReason: 'STOP' }, { finishReason: 'STOP' }] }]) {
    await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), selected(), async () => ({ ok: true, json: async () => result })), error => error.code === 'GEMINI_INCOMPLETE');
  }
});

test('Gemini rejects malformed JSON, empty output and invalid transcript structure or times without truncating', async () => {
  for (const text of ['not json', '```json\n{}\n```', '']) {
    await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), selected(), async () => ({ ok: true,
      json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }) })), error => error.code === 'GEMINI_INVALID_RESPONSE');
  }
  for (const value of [{ text: 'No timed segments', segments: [] }, { text: 'a'.repeat(200001), segments: [] },
    { ...transcript, segments: [{ ...transcript.segments[0], start: -1 }] }, { ...transcript, segments: [{ ...transcript.segments[0], end: 13 }] },
    { ...transcript, segments: [{ ...transcript.segments[0], start: 4, end: 2 }] }, { ...transcript, segments: [{ ...transcript.segments[0], text: 'a'.repeat(6001) }] }]) {
    assert.throws(() => validateGeminiArchiveTranscript(value, 10), error => error.code === 'GEMINI_INVALID_TRANSCRIPT');
  }
});

test('Gemini report requires duration and grounded start/end timestamps and bounded output', async () => {
  const malformed = [
    { ...report, observations: [{ ...report.observations[0], atSeconds: 9.5, endSeconds: 10 }] },
    { ...report, observations: [{ ...report.observations[0], endSeconds: 9.5 }] },
    { ...report, observations: [{ ...report.observations[0], endSeconds: 15 }] },
    { ...report, observations: Array.from({ length: 301 }, () => report.observations[0]) },
    { ...report, summary: 'a'.repeat(6001) },
  ];
  for (const value of malformed) await assert.rejects(() => summarizeCallArchive(transcript, 10, selected(), async () => success(value)));
  await assert.rejects(() => summarizeCallArchive(transcript, NaN, selected(), async () => { throw new Error('No request expected'); }));
});

test('Gemini refuses oversized inline audio before sending a request and full cap stays below total JSON limit', async () => {
  let called = false;
  await assert.rejects(() => transcribeCallArchive(Buffer.alloc(GEMINI_ARCHIVE_MAX_AUDIO_BYTES + 1), selected(), async () => { called = true; }), error => error.code === 'AUDIO_TOO_LARGE');
  assert.equal(called, false);
  await transcribeCallArchive(Buffer.alloc(GEMINI_ARCHIVE_MAX_AUDIO_BYTES), selected(), async (_url, request) => {
    assert.ok(Buffer.byteLength(request.body) < 20_000_000); return success({ text: '', segments: [] });
  });
});

test('archive chunk pipeline passes actual media duration and supported MIME metadata to selected AI provider', async () => {
  let received;
  await transcribeCallArchiveChunks({ mime: 'audio/mp4', duration_seconds: '9.75' }, { head: async () => ({ length: 4 }), buffer: async () => Buffer.from('test') },
    selected(), async (_buffer, config, _fetcher, audio) => { received = { config, audio }; return transcript; });
  assert.equal(received.config.aiProvider, 'gemini'); assert.equal(received.audio.durationSeconds, 9.75); assert.equal(received.audio.mime, 'audio/mp4');
});

test('Gemini model path and unsupported audio formats reject before leaking payload or credentials', async () => {
  const unexpected = async () => { throw new Error('No request expected'); };
  await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), { ...selected(), transcriptionModel: '../other?key=bad' }, unexpected), error => error.code === 'AI_MODEL_INVALID');
  await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), selected(), unexpected, { mime: 'text/html' }), error => error.code === 'AI_AUDIO_FORMAT_UNSUPPORTED');
});
