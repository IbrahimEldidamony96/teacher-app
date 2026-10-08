import {
  HOMEWORK_ORDER,
  HOMEWORK_LABELS,
  HOMEWORK_BADGE,
  formatDate,
} from "@/lib/labels";
import { homeworkCounts } from "@/lib/grades";

// data comes from getStudentHomework(). Notes are private to the tutor unless showNotes is set.
export default function HomeworkSummary({ data, showNotes = false }) {
  const { upcoming, checked } = data;

  if (upcoming.length === 0 && checked.length === 0) {
    return <p className="text-sm text-gray-500">مفيش واجبات لسه.</p>;
  }

  const counts = homeworkCounts(checked.map((c) => c.status));

  return (
    <div className="space-y-3">
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-gray-500">مطلوب</h4>
          <ul className="divide-y divide-gray-300 rounded border border-gray-300 text-sm">
            {upcoming.map((h) => (
              <li key={h.id} className="px-3 py-2">
                <span className="font-medium">{h.title}</span>{" "}
                <span className="text-gray-500">
                  - {h.groupName} - لحد {formatDate(h.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {checked.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {HOMEWORK_ORDER.map((s) => (
              <span key={s} className={`rounded px-2 py-1 text-xs ${HOMEWORK_BADGE[s]}`}>
                {HOMEWORK_LABELS[s]}: {counts[s]}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-gray-300 rounded border border-gray-300 text-sm">
            {checked.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="font-medium">{c.title}</span>{" "}
                  <span className="text-gray-500">- {formatDate(c.dueDate)}</span>
                  {showNotes && c.note && (
                    <span className="block text-xs text-gray-500">{c.note}</span>
                  )}
                </span>
                <span className={`shrink-0 rounded px-2 py-1 text-xs ${HOMEWORK_BADGE[c.status]}`}>
                  {HOMEWORK_LABELS[c.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
