import { formatDate, formatScore } from "@/lib/labels";
import { percent, studentExamSummary } from "@/lib/grades";

// rows come from getStudentExams(). Notes are private to the tutor unless showNotes is set.
export default function GradesSummary({ rows, showNotes = false }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">مفيش درجات متسجلة لسه.</p>;
  }

  const summary = studentExamSummary(rows);

  return (
    <div className="space-y-3">
      {summary.averagePercent !== null && (
        <p className="text-sm">
          متوسط الدرجات: <strong>{summary.averagePercent}%</strong>{" "}
          <span className="text-gray-500">(من {summary.taken} اختبار)</span>
        </p>
      )}

      <ul className="divide-y divide-gray-300 rounded border border-gray-300 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              <span className="font-medium">{r.title}</span>{" "}
              <span className="text-gray-500">
                - {r.groupName} - {formatDate(r.date)}
              </span>
              {showNotes && r.note && <span className="block text-xs text-gray-500">{r.note}</span>}
            </span>
            {r.score === null ? (
              <span className="shrink-0 rounded bg-gray-500/20 px-2 py-1 text-xs text-gray-500">
                غايب
              </span>
            ) : (
              <span className="shrink-0 text-end">
                <strong>
                  {formatScore(r.score)} / {formatScore(r.maxScore)}
                </strong>{" "}
                <span className="text-xs text-gray-500">
                  ({Math.round(percent(r.score, r.maxScore))}%)
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
