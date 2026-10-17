import test from 'node:test';
import assert from 'node:assert/strict';
import { getCallArchiveConfig, callArchiveCapabilities } from '../server/services/callArchiveConfig.js';
import { verifiedHumanParticipant } from '../server/services/callArchiveProvider.js';
import { parseArchiveRange, validArchiveKey } from '../server/services/callArchiveStorage.js';
import { transcribeCallArchive, summarizeCallArchive, validateCallArchiveReport } from '../server/services/callArchiveAI.js';

const config = { aiKey: 'local-mock-only', transcriptionModel: 'gpt-4o-transcribe-diarize', reportModel: 'gpt-4.1-mini' };
const report = { summary: 'راجع المقرئ تلاوة الطالب.', passage: '', observations: [{ id: 'external-id', atSeconds: 2, endSeconds: 4,
  speaker: 'A', category: 'possible_error', detail: 'صحح المقرئ موضعًا.', correction: 'إعادة الموضع', response: 'أعاد الطالب', confidence: 'medium' }], followUp: ['مراجعة الموضع'], limitations: ['يلزم اعتماد المقرئ.'] };
const transcript = { text: 'أعد هذا الموضع.', segments: [{ start: 1, end: 5, speaker: 'A', text: 'أعد هذا الموضع.' }] };

test('archive stays explicitly unconfigured without private storage and livekit', () => {
  assert.equal(getCallArchiveConfig({}).configured, false);
  assert.equal(getCallArchiveConfig({ CALL_ARCHIVE_ENABLED: 'true', CALL_ARCHIVE_STORAGE_PATH: '../public' }).configured, false);
  assert.equal(callArchiveCapabilities(getCallArchiveConfig({})).aiConfigured, false);
});

test('only verified standard human identities count; recorder/agent/SIP identities cannot trigger recording', () => {
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
