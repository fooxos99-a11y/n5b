import assert from 'node:assert/strict';

const START_PAGE = 22;
const LINK_SIZE = 5;
const REVIEW_SIZE = 5;
const SCENARIO_END_PAGE = { finish: 26, 'plan-edit': 90 };
const DEFAULT_END_PAGE = 80;

const pagesOf = (record, type) => record.assignments.find((row) => row.type === type).pages;
const byPage = (a, b) => a - b;

function startCursor(cursors, scenario, day) {
  if (scenario === 'plan-edit' && day === 15) return START_PAGE;
  return cursors.get(scenario) ?? START_PAGE;
}

function savedPages(record) {
  const saved = new Set(record.previousMemorized);
  if (!record.skipped) for (const page of pagesOf(record, 'memorization')) saved.add(page);
  return saved;
}

function expectedLinkPages(saved, sorted, end) {
  let next = START_PAGE;
  while (saved.has(next) && next <= end) next += 1;
  return next > end ? [] : sorted.filter((page) => page < next).slice(-LINK_SIZE);
}

function expectedReviewPages(sorted, link, cursor) {
  const available = sorted.filter((page) => !link.includes(page));
  const rotated = [...available.filter((page) => page >= cursor), ...available.filter((page) => page < cursor)];
  // Student recordings keep the plan active for review until teacher approval.
  return rotated.slice(0, REVIEW_SIZE);
}

// Independent page-set oracle for the full-page, forward scenarios in the weeks audit.
export function verifyWeeksEvidence(records) {
  const cursors = new Map();
  for (const record of records) {
    const { scenario, date, skipped } = record;
    let cursor = startCursor(cursors, scenario, Number(date.slice(-2)));
    const saved = savedPages(record);
    const sorted = [...saved].sort(byPage);
    const end = SCENARIO_END_PAGE[scenario] ?? DEFAULT_END_PAGE;
    const expectedLink = expectedLinkPages(saved, sorted, end);
    assert.deepEqual(pagesOf(record, 'link'), expectedLink, `${scenario} ${date}: exact linking`);
    const expectedReview = expectedReviewPages(sorted, expectedLink, cursor);
    assert.deepEqual(pagesOf(record, 'review'), [...expectedReview].sort(byPage), `${scenario} ${date}: review rotation`);
    if (!skipped && expectedReview.length) cursor = expectedReview.at(-1) + 1;
    cursors.set(scenario, cursor);
  }
  return records.length;
}
