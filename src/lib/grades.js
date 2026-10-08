// Pure grading / homework helpers (no database), easy to test.

export function percent(score, max) {
  return max > 0 ? (score / max) * 100 : 0;
}

const round1 = (n) => Math.round(n * 10) / 10;

// scores: numbers, or null for a student who was absent
export function examStats(scores, max) {
  const taken = scores.filter((s) => s !== null);
  if (taken.length === 0) {
    return { taken: 0, absent: scores.length, average: null, highest: null, lowest: null, averagePercent: null };
  }
  const average = taken.reduce((sum, s) => sum + s, 0) / taken.length;
  return {
    taken: taken.length,
    absent: scores.length - taken.length,
    average: round1(average),
    highest: Math.max(...taken),
    lowest: Math.min(...taken),
    averagePercent: Math.round(percent(average, max)),
  };
}

// rows: { score: number | null, maxScore: number } for one student. Absences are not averaged in.
export function studentExamSummary(rows) {
  const taken = rows.filter((r) => r.score !== null);
  const averagePercent =
    taken.length > 0
      ? Math.round(taken.reduce((sum, r) => sum + percent(r.score, r.maxScore), 0) / taken.length)
      : null;
  return { taken: taken.length, absent: rows.length - taken.length, averagePercent };
}

export function homeworkCounts(statuses) {
  const counts = { DONE: 0, PARTIAL: 0, NOT_DONE: 0, total: statuses.length };
  for (const s of statuses) counts[s] += 1;
  return counts;
}
