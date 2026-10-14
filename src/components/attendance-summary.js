import {
  ATTENDANCE_ORDER,
  ATTENDANCE_LABELS,
  ATTENDANCE_BADGE,
  formatDate,
} from "@/lib/labels";

// summary comes from getStudentAttendance(). Notes are private to the tutor unless showNotes is set.
export default function AttendanceSummary({ summary, showNotes = false }) {
  if (summary.total === 0) {
    return <p className="ui-empty">مفيش حضور متسجل لسه.</p>;
  }

  const numericRate = Number(summary.rate);
  const rate = Number.isFinite(numericRate) ? Math.min(100, Math.max(0, numericRate)) : 0;

  return (
    <div className="space-y-4">
      <div className="ui-panel space-y-3">
        <p className="text-sm text-slate-600">
          نسبة الحضور: <strong className="text-lg text-slate-900">{summary.rate}%</strong>{" "}
          <span className="text-slate-500">(من {summary.total} حصة)</span>
        </p>
        <div
          className="ui-progress"
          role="meter"
          aria-label="نسبة الحضور"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rate}
          aria-valuetext={`${rate}%`}
        >
          <span className="ui-progress-fill" style={{ width: `${rate}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_ORDER.map((s) => (
          <span key={s} className={`ui-badge ${ATTENDANCE_BADGE[s]}`}>
            {ATTENDANCE_LABELS[s]}: {summary.counts[s]}
          </span>
        ))}
      </div>

      <ul className="ui-card divide-y divide-gray-200 text-sm">
        {summary.recent.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <span className="min-w-0 break-words">
              {formatDate(r.date)} <span className="text-slate-500">- {r.group.name}</span>
              {showNotes && r.note && <span className="mt-1 block text-xs text-slate-500">{r.note}</span>}
            </span>
            <span className={`ui-badge shrink-0 ${ATTENDANCE_BADGE[r.status]}`}>
              {ATTENDANCE_LABELS[r.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
