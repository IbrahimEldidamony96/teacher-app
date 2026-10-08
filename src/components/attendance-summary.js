import {
  ATTENDANCE_ORDER,
  ATTENDANCE_LABELS,
  ATTENDANCE_BADGE,
  formatDate,
} from "@/lib/labels";

// summary comes from getStudentAttendance(). Notes are private to the tutor unless showNotes is set.
export default function AttendanceSummary({ summary, showNotes = false }) {
  if (summary.total === 0) {
    return <p className="text-sm text-gray-500">مفيش حضور متسجل لسه.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        نسبة الحضور: <strong>{summary.rate}%</strong>{" "}
        <span className="text-gray-500">(من {summary.total} حصة)</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_ORDER.map((s) => (
          <span key={s} className={`rounded px-2 py-1 text-xs ${ATTENDANCE_BADGE[s]}`}>
            {ATTENDANCE_LABELS[s]}: {summary.counts[s]}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-gray-300 rounded border border-gray-300 text-sm">
        {summary.recent.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span>
              {formatDate(r.date)} <span className="text-gray-500">- {r.group.name}</span>
              {showNotes && r.note && <span className="block text-xs text-gray-500">{r.note}</span>}
            </span>
            <span className={`shrink-0 rounded px-2 py-1 text-xs ${ATTENDANCE_BADGE[r.status]}`}>
              {ATTENDANCE_LABELS[r.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
