import { formatDate, formatScore } from "@/lib/labels";
import { percent, studentExamSummary } from "@/lib/grades";

// rows come from getStudentExams(). Notes are private to the tutor unless showNotes is set.
export default function GradesSummary({ rows, showNotes = false }) {
  if (rows.length === 0) {
    return <p className="ui-empty">مفيش درجات متسجلة لسه.</p>;
  }

  const summary = studentExamSummary(rows);

  return (
    <div className="space-y-4">
      {summary.averagePercent !== null && (
        <p className="ui-panel text-sm text-slate-600">
          متوسط الدرجات: <strong className="text-lg text-slate-900">{summary.averagePercent}%</strong>{" "}
          <span className="text-slate-500">(من {summary.taken} اختبار)</span>
        </p>
      )}

      <ul className="ui-card divide-y divide-gray-200 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <span className="min-w-0 break-words">
              <span className="font-semibold text-slate-800">{r.title}</span>{" "}
              <span className="text-slate-500">
                - {r.groupName} - {formatDate(r.date)}
              </span>
              {showNotes && r.note && <span className="mt-1 block text-xs text-slate-500">{r.note}</span>}
            </span>
            {r.score === null ? (
              <span className="ui-badge shrink-0 bg-slate-100 text-slate-500">
                غايب
              </span>
            ) : (
              <span className="shrink-0 text-end">
                <strong className="text-slate-900">
                  {formatScore(r.score)} / {formatScore(r.maxScore)}
                </strong>{" "}
                <span className="text-xs text-slate-500">
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
