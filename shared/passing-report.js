import { passingPercentage, passingRating } from './passing-ratings.js';

export function buildPassingReport(exams, memorizedParts = []) {
  const byJuz = new Map();
  for (const exam of exams) for (const part of exam.parts) {
    for (const attempt of part.attempts) {
      const number = Number(part.juzNumber);
      if (!byJuz.has(number)) byJuz.set(number, []);
      byJuz.get(number).push({ ...attempt, type: exam.type, examId: exam.id });
    }
  }
  const parts = [...byJuz].sort((first, second) => first[0] - second[0]).map(([juzNumber, attempts]) => {
    attempts.sort((first, second) => Number(second.id) - Number(first.id));
    return { juzNumber, attempts, latestAttempt: attempts[0] };
  });
  const latest = parts.map(part => part.latestAttempt), percentages = latest.map(attempt => passingPercentage(attempt.result)).filter(value => value !== null);
  const percentage = percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length * 10000) / 10000 : null;
  const newest = [...latest].sort((first, second) => Number(second.id) - Number(first.id))[0];
  return { parts, summary: { percentage, rating: passingRating(percentage, newest?.policy?.ratings),
    testedParts: latest.length, passedParts: latest.filter(attempt => attempt.result.passed).length,
    attemptCount: parts.reduce((sum, part) => sum + part.attempts.length, 0), memorizedParts: memorizedParts.length } };
}
