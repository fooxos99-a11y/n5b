import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PASSING_RATINGS, normalizePassingRatings, passingRatingErrors, passingPercentage, passingRating } from '../shared/passing-ratings.js';
import { parsePassingPolicy, passingPolicyErrors, evaluatePassingPart } from '../shared/passing-policy.js';

test('rating thresholds are inclusive, normalized, and independent from the passing score', () => {
  const policy = parsePassingPolicy({});
  assert.deepEqual(policy.ratings, DEFAULT_PASSING_RATINGS);
  for (const [percentage, label] of [[100,'ممتاز'],[95,'ممتاز'],[94.99,'جيد جدًا'],[90,'جيد جدًا'],[85,'جيد'],[84.99,'يحتاج إعادة'],[0,'يحتاج إعادة']]) {
    assert.equal(passingRating(percentage, policy.ratings), label);
  }
  const result = evaluatePassingPart({ ...policy.branch, passScore: 99, ratings: policy.ratings }, { mistakeCount: 1 });
  assert.deepEqual([result.percentage, result.rating, result.passed], [95,'ممتاز',false]);
  assert.deepEqual(normalizePassingRatings([{label:' ب ',minimumPercentage:0},{label:'أ',minimumPercentage:90}]), [{label:'أ',minimumPercentage:90},{label:'ب',minimumPercentage:0}]);
});

test('rating policy rejects invalid, duplicated, excessive, and unsafe bands', () => {
  for (const rows of [null, {}, Array.from({length:21},(_,index)=>({label:String(index),minimumPercentage:index})),
    [{label:'',minimumPercentage:95}], [{label:'<img>',minimumPercentage:95}], [{label:'س'.repeat(61),minimumPercentage:95}],
    [{label:'أ',minimumPercentage:101}], [{label:'أ',minimumPercentage:-1}], [{label:'أ',minimumPercentage:'95'}], [null],
    [{label:'أ',minimumPercentage:95},{label:'أ',minimumPercentage:90}], [{label:'أ',minimumPercentage:95},{label:'ب',minimumPercentage:95}]]) {
    assert.ok(Object.keys(passingRatingErrors(rows)).length, JSON.stringify(rows));
    assert.ok(Object.keys(passingPolicyErrors({...parsePassingPolicy({}),ratings:rows})).length);
  }
  assert.deepEqual(passingRatingErrors([]), {});
  assert.equal(passingRating(95, []), null);
  assert.equal(passingRating(null, DEFAULT_PASSING_RATINGS), null);
});

test('percentages normalize different full scores with predictable precision', () => {
  assert.equal(passingPercentage({score:18,maxScore:20}),90);
  assert.equal(passingPercentage({score:1,maxScore:3}),33.3333);
  assert.equal(passingPercentage({score:120,maxScore:100}),100);
  assert.equal(passingPercentage({score:-10,maxScore:100}),0);
  for (const result of [null,{}, {score:1,maxScore:0}, {score:1,maxScore:'bad'}]) assert.equal(passingPercentage(result),null);
});
