import test from 'node:test';
import assert from 'node:assert/strict';
import { getCallArchiveConfig, callArchiveCapabilities } from '../server/services/callArchiveConfig.js';
import { verifiedHumanParticipant } from '../server/services/callArchiveProvider.js';
import { parseArchiveRange, validArchiveKey } from '../server/services/callArchiveStorage.js';
import { transcribeCallArchive, summarizeCallArchive, validateCallArchiveReport } from '../server/services/callArchiveAI.js';
import { assertCallArchiveAvailable, canManageCallArchive, canAccessCallArchive, canReviewCallArchive, callArchiveSqlScope } from '../server/services/callArchive.js';

const config = { aiKey: 'local-mock-only', transcriptionModel: 'gpt-4o-transcribe-diarize', reportModel: 'gpt-4.1-mini' };
const report = { summary: 'راجع المقرئ تلاوة الطالب.', passage: '', observations: [{ id: 'external-id', atSeconds: 2, endSeconds: 4,
  speaker: 'A', category: 'possible_error', detail: 'صحح المقرئ موضعًا.', correction: 'إعادة الموضع', response: 'أعاد الطالب', confidence: 'medium' }], followUp: ['مراجعة الموضع'], limitations: ['يلزم اعتماد المقرئ.'] };
const transcript = { text: 'أعد هذا الموضع.', segments: [{ start: 1, end: 5, speaker: 'A', text: 'أعد هذا الموضع.' }] };

test('recording activation can pause new joins before token issuance', () => {
  const previous = process.env.CALL_ARCHIVE_JOIN_PAUSED;
  process.env.CALL_ARCHIVE_JOIN_PAUSED = 'true';
  try {
    assert.throws(
      () => assertCallArchiveAvailable(),
      error => error.statusCode === 503 && error.code === 'call_recording_setup'
    );
    assert.equal(getCallArchiveConfig({}).joinPaused, false);
  } finally {
    if (previous === undefined) delete process.env.CALL_ARCHIVE_JOIN_PAUSED;
    else process.env.CALL_ARCHIVE_JOIN_PAUSED = previous;
  }
});

test('recording never requires a separate approval, whether enabled or disabled', () => {
  for (const enabled of ['true', 'false']) {
    const capabilities = callArchiveCapabilities(getCallArchiveConfig({ CALL_ARCHIVE_ENABLED: enabled }));
    assert.equal(capabilities.enabled, enabled === 'true');
    assert.equal(capabilities.consentRequired, false);
    assert.equal(Object.hasOwn(capabilities, 'consentVersion'), false);
  }
});

test('archive access is administration-only even for the room owner or a participant', async () => {
  const session = { id: 'session', owner_role: 'reciter', owner_id: 7 };
  for (const role of ['student', 'supervisor', 'reciter', 'teacher', 'unknown', undefined]) {
    const auth = { role, id: 7 };
    assert.equal(await canManageCallArchive(auth), false);
    assert.equal(await canAccessCallArchive(auth, { ...session, owner_role: role }), false);
    assert.equal(await canReviewCallArchive(auth, session), false);
    assert.deepEqual(await callArchiveSqlScope(auth), { sql: '1=0', params: [] });
  }
  assert.equal(await canAccessCallArchive(null, session), false);
  assert.equal(await canAccessCallArchive({ role: 'manager', id: 1 }, null), false);
  assert.equal(await canAccessCallArchive({ role: 'manager', id: 1 }, session), true);
  assert.equal(await canReviewCallArchive({ role: 'manager', id: 1 }, session), true);
  assert.deepEqual(await callArchiveSqlScope({ role: 'manager', id: 1 }), { sql: '1=1', params: [] });
});

test('archive stays explicitly unconfigured without private storage and livekit', () => {
  assert.equal(getCallArchiveConfig({}).configured, false);
  assert.equal(getCallArchiveConfig({ CALL_ARCHIVE_ENABLED: 'true', CALL_ARCHIVE_STORAGE_PATH: '../public' }).configured, false);
  assert.equal(callArchiveCapabilities(getCallArchiveConfig({})).aiConfigured, false);
});

test('only verified standard human identities count; recorder/agent/SIP identities cannot trigger recording', () => {
  assert.equal(verifiedHumanParticipant({ identity: 'student:7', sid: 'PA_connection' }).connectionSid, 'PA_connection');
  assert.equal(verifiedHumanParticipant({ identity: 'student:7' }).connectionSid, null);
  assert.equal(verifiedHumanParticipant({ identity: 'reciter:7', kind: 0, tracks: [{ type: 0, sid: 'microphone' }, { type: 1, sid: 'camera' }] }).tracks[0], 'microphone');
  for (const person of [{ identity: 'reciter:7', kind: 1 }, { identity: 'student:7', kind: 4 }, { identity: 'EG_abc' }, { identity: 'student:0' }, { identity: 'unknown:4' }]) assert.equal(verifiedHumanParticipant(person), null);
});

test('private object keys and single ranges reject traversal, multipart and invalid offsets', () => {
  assert.equal(validArchiveKey('a'.repeat(20) + '/call-archives/' + 'a'.repeat(36) + '/' + 'b'.repeat(36) + '.mp4'), true);
  assert.equal(validArchiveKey('../public/audio.mp4'), false);
  assert.deepEqual(parseArchiveRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseArchiveRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseArchiveRange('bytes=8-', 10), { start: 8, end: 9 });
  for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=0-2,4-6', 'bytes=-0']) assert.throws(() => parseArchiveRange(range, 10), error => error.statusCode === 416);
});

test('transcription uses current diarized multipart API without logging or client-side secrets', async () => {
  let called = false;
  const result = await transcribeCallArchive(Buffer.from('local mocked audio'), config, async (url, request) => {
    called = true;
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(request.body.get('response_format'), 'diarized_json');
    assert.equal(request.body.get('chunking_strategy'), 'auto');
    assert.equal(request.body.get('language'), 'ar');
    return { ok: true, json: async () => transcript };
  });
  assert.equal(called, true);
  assert.equal(result.segments[0].speaker, 'A');
  await assert.rejects(() => transcribeCallArchive(Buffer.from('audio'), { ...config, aiKey: '' }), error => error.code === 'AI_UNCONFIGURED');
});

test('report API requests strict schema and store:false, preserves probable errors until teacher approval', async () => {
  const result = await summarizeCallArchive(transcript, 20, config, async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(report) }] }] }) };
  });
  assert.equal(result.observations[0].id, 'observation-1');
  assert.equal(result.observations[0].category, 'possible_error');
  assert.equal(result.approvedErrors, undefined);
});

test('report rejects refusals, incomplete responses and invented timestamps', async () => {
  for (const result of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...report, observations: [{ ...report.observations[0], atSeconds: 12, endSeconds: 13 }] }) }] }] }]) {
    await assert.rejects(() => summarizeCallArchive(transcript, 20, config, async () => ({ ok: true, json: async () => result })));
  }
  assert.throws(() => validateCallArchiveReport({ ...report, observations: [{ ...report.observations[0], atSeconds: -1 }] }, 20));
});
