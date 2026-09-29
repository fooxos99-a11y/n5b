import { evaluateLink, evaluateMemorization, evaluateReview } from '../../shared/grading-engine.js';
import { hizbOfPage } from '../../shared/quran-hizbs.js';

const countsOf = (counts, item) => {
  const entry = counts[String(item.id)] || {};
  return { mistakes: Number(entry.mistakeCount) || 0, warnings: Number(entry.warningCount) || 0 };
};

/**
 * Live day result of one recitation group from the counts being entered:
 * per-face results for memorization, per-hizb results for review, one amount for link.
 * @returns {{ itemResults: Map<string, {score:number, failed:boolean}>, result: object } | null}
 */
export function evaluateRecitationGroup(policy, taskType, items = [], counts = {}) {
  if (!policy || !items.length) return null;
  const itemResults = new Map();
  if (taskType === 'memorization') {
    const result = evaluateMemorization(policy, { faces: items.map((item) => countsOf(counts, item)) });
    result.faces.forEach((face, index) => itemResults.set(String(items[index].id), { score: face.score, failed: face.failed }));
    return { itemResults, result, failedLabel: result.failedFaceIndex ? `الوجه ${result.failedFaceIndex}` : '' };
  }
  if (taskType === 'review') {
    const groups = new Map();
    for (const item of items) {
      const hizb = Number(item.hizbNumber) || (item.fromPage ? hizbOfPage(item.fromPage) : null);
      const key = hizb ? `hizb:${hizb}` : `item:${item.id}`;
      const group = groups.get(key) || { hizb, itemIds: [], mistakes: 0, warnings: 0 };
      const { mistakes, warnings } = countsOf(counts, item);
      group.itemIds.push(String(item.id));
      group.mistakes += mistakes;
      group.warnings += warnings;
      groups.set(key, group);
    }
    const ordered = [...groups.values()];
    const result = evaluateReview(policy, { hizbs: ordered });
    result.hizbs.forEach((hizb, index) => {
      for (const id of ordered[index].itemIds) itemResults.set(id, { score: Math.max(0, 1 - hizb.deduction), failed: hizb.failed });
    });
    const failedHizb = result.failedHizbIndex ? ordered[result.failedHizbIndex - 1] : null;
    return { itemResults, result, failedLabel: failedHizb ? (failedHizb.hizb ? `الحزب ${failedHizb.hizb}` : `الحزب ${result.failedHizbIndex}`) : '' };
  }
  if (taskType === 'link') {
    const total = items.reduce((sum, item) => {
      const { mistakes, warnings } = countsOf(counts, item);
      return { mistakes: sum.mistakes + mistakes, warnings: sum.warnings + warnings };
    }, { mistakes: 0, warnings: 0 });
    const result = evaluateLink(policy, total);
    for (const item of items) itemResults.set(String(item.id), null);
    return { itemResults, result, failedLabel: '' };
  }
  return null;
}
