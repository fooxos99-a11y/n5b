import assert from 'node:assert/strict';
import test from 'node:test';
import { addRegistrationRange, clearRegistrationRangeDraft, decodePublicRegistrationConfiguration, decodeRegistrationSubmissionResult, emptyRegistrationForm,
  emptyRegistrationRangeDraft, normalizeRegistrationContext, registrationCommittees, registrationDigits, registrationJuzOptions,
  registrationRangeLabel, registrationSubmissionFailure, removeRegistrationRange, updateRegistrationField, updateRegistrationRangeDraft, validateRegistrationForm,
  type PublicRegistrationConfiguration, type RegistrationForm } from '../src/domain/registrationForm';

const configuration: PublicRegistrationConfiguration = { enabled: true, juzRanges: [{ juz: 1 }, { juz: 2 }],
  complexes: [{ id: 1, name: 'مجمع اختبار' }, { id: 2, name: 'مجمع ثانٍ' }],
  committees: [{ id: 7, name: 'حلقة اختبار', complexId: 1 }, { id: 8, name: 'حلقة أخرى', complexId: 2 }] };
const validForm: RegistrationForm = { ...emptyRegistrationForm(), name: 'طالب اختبار', age: '12', complexId: '1', committeeId: '7' };

test('public registration keeps guardian phone, identity and memorization optional', () => {
  const result = validateRegistrationForm(validForm, configuration, emptyRegistrationRangeDraft(), []);
  assert.equal(result.valid, true);
  if (!result.valid) assert.fail('A valid student request must be accepted.');
  assert.deepEqual(result.payload, { ...validForm, memorization: { fullJuzs: [] } });
  assert.equal('password' in result.payload, false);
});

test('registration validates real name and age bounds and refuses a closed configuration', () => {
  for (const name of ['', 'أ', 'أ'.repeat(181)]) assert.equal(validateRegistrationForm({ ...validForm, name }, configuration, emptyRegistrationRangeDraft(), []).valid, false);
  for (const age of ['', '3', '121', '4.5', 'غير رقمي']) assert.equal(validateRegistrationForm({ ...validForm, age }, configuration, emptyRegistrationRangeDraft(), []).valid, false);
  for (const age of ['4', '120']) assert.equal(validateRegistrationForm({ ...validForm, age }, configuration, emptyRegistrationRangeDraft(), []).valid, true);
  assert.equal(validateRegistrationForm(validForm, { ...configuration, enabled: false }, emptyRegistrationRangeDraft(), []).valid, false);
});

test('circle choices belong to the selected complex and changing complex clears the old circle', () => {
  assert.deepEqual(registrationCommittees(configuration, '1').map(committee => committee.id), [7]);
  const changed = updateRegistrationField(validForm, 'complexId', '2');
  assert.equal(changed.committeeId, '');
  assert.equal(validForm.committeeId, '7');
  assert.equal(validateRegistrationForm({ ...validForm, committeeId: '8' }, configuration, emptyRegistrationRangeDraft(), []).valid, false);
  assert.equal(validateRegistrationForm({ ...validForm, complexId: '999' }, configuration, emptyRegistrationRangeDraft(), []).valid, false);
});

test('Arabic and Persian digits use the current input normalization and length limits', () => {
  assert.equal(registrationDigits('٠٥١-۲۳٤'), '051234');
  assert.equal(updateRegistrationField(validForm, 'age', '١٢٣٤').age, '123');
  assert.equal(updateRegistrationField(validForm, 'guardianPhone', '٠'.repeat(42)).guardianPhone.length, 40);
});

test('juz overlap and adjacency merge, duplicate parts disappear and payload expands current ranges', () => {
  const first = addRegistrationRange([], { startJuz: '1', endJuz: '3' });
  assert.equal(first.valid, true);
  if (!first.valid) assert.fail('Expected valid first range.');
  const next = addRegistrationRange(first.ranges, { startJuz: '3', endJuz: '5' });
  assert.equal(next.valid, true);
  if (!next.valid) assert.fail('Expected overlapping range.');
  assert.deepEqual(next.ranges, [{ startJuz: 1, endJuz: 5 }]);
  const adjacent = addRegistrationRange(next.ranges, { startJuz: '6', endJuz: '6' });
  if (!adjacent.valid) assert.fail('Expected adjacent range.');
  assert.deepEqual(adjacent.ranges, [{ startJuz: 1, endJuz: 6 }]);
  const result = validateRegistrationForm(validForm, configuration, emptyRegistrationRangeDraft(), adjacent.ranges);
  if (!result.valid) assert.fail('Expected valid request.');
  assert.deepEqual(result.payload.memorization.fullJuzs, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(removeRegistrationRange(adjacent.ranges, 0), []);
  assert.equal(registrationRangeLabel({ startJuz: 2, endJuz: 2 }), 'الجزء 2');
});

test('unfinished, reversed and out-of-range memorization selections are rejected', () => {
  for (const draft of [{ startJuz: '', endJuz: '' }, { startJuz: '1', endJuz: '' }, { startJuz: '5', endJuz: '2' }, { startJuz: '0', endJuz: '31' }]) assert.equal(addRegistrationRange([], draft).valid, false);
  assert.equal(validateRegistrationForm(validForm, configuration, { startJuz: '1', endJuz: '1' }, []).valid, false);
  assert.deepEqual(updateRegistrationRangeDraft(emptyRegistrationRangeDraft(), 'startJuz', '2'), { startJuz: '2', endJuz: '2' });
  assert.deepEqual(registrationJuzOptions({ ...configuration, juzRanges: [] }), Array.from({ length: 30 }, (_, index) => index + 1));
});

test('registration decoders preserve placement relationships and reject malformed server responses', () => {
  assert.deepEqual(decodePublicRegistrationConfiguration(configuration), configuration);
  assert.deepEqual(decodeRegistrationSubmissionResult({ ok: true, id: 10 }), { ok: true, id: 10 });
  for (const response of [null, {}, { ...configuration, enabled: 'true' }, { ...configuration, committees: [{ id: 7, name: 'حلقة', complexId: 0 }] }, { ...configuration, juzRanges: [{ juz: 31 }] }]) assert.throws(() => decodePublicRegistrationConfiguration(response));
  for (const response of [{ ok: false, id: 1 }, { ok: true }, { ok: true, id: -1 }]) assert.throws(() => decodeRegistrationSubmissionResult(response));
});

test('registration context accepts only the existing opaque tenant key format and its default', () => {
  assert.equal(normalizeRegistrationContext(''), '');
  assert.equal(normalizeRegistrationContext(' 1234 '), '1234');
  assert.equal(normalizeRegistrationContext('school_1-test'), 'school_1-test');
  for (const context of ['https://fixture.invalid', '../other', 'a'.repeat(33)]) assert.throws(() => normalizeRegistrationContext(context));
});

test('clearing an unfinished range keeps the accepted memorization and permits submission', () => {
  const existing = [{ startJuz: 1, endJuz: 2 }];
  assert.equal(validateRegistrationForm(validForm, configuration, { startJuz: '3', endJuz: '3' }, existing).valid, false);
  const result = validateRegistrationForm(validForm, configuration, clearRegistrationRangeDraft(), existing);
  if (!result.valid) assert.fail('Clearing the draft should unblock the request.');
  assert.deepEqual(result.payload.memorization.fullJuzs, [1, 2]);
});

test('submission failures distinguish the public HTTP contract without exposing native messages', () => {
  assert.equal(registrationSubmissionFailure({ status: 403, code: 'forbidden' }).kind, 'closed');
  assert.equal(registrationSubmissionFailure({ status: 409 }).message, 'يوجد طلب تسجيل بهذه البيانات.');
  assert.equal(registrationSubmissionFailure({ status: 429, retryAfterMs: 1000 }).kind, 'rate-limited');
  assert.equal(registrationSubmissionFailure({ code: 'network' }).kind, 'network');
  assert.equal(registrationSubmissionFailure({ code: 'timeout' }).kind, 'network');
  assert.equal(registrationSubmissionFailure(new Error('private internal response')).message.includes('private'), false);
});
