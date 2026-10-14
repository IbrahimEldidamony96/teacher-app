import {
  HOMEWORK_ORDER,
  HOMEWORK_LABELS,
  HOMEWORK_BADGE,
  formatDate,
} from "@/lib/labels";
import { homeworkCounts } from "@/lib/grades";
import Link from "next/link";

// data comes from getStudentHomework(). Notes are private to the tutor unless showNotes is set.
export default function HomeworkSummary({ data, showNotes = false, studentId = null }) {
  const { upcoming = [], overdue = [], submitted = [], checked = [] } = data ?? {};
  const pending = [...overdue, ...upcoming, ...submitted];

  if (pending.length === 0 && checked.length === 0) {
    return <p className="ui-empty">مفيش واجبات لسه.</p>;
  }

  const counts = homeworkCounts(checked.map((c) => c.status));

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-500">المطلوب وتسليمات في انتظار المراجعة</h4>
          <ul className="ui-card divide-y divide-gray-200 text-sm">
            {pending.map((h) => (
              <li key={h.id} className="break-words px-4 py-4 sm:px-5">
                <span className="font-semibold text-slate-800">{h.title}</span>{" "}
                <span className="text-slate-500">
                  - {h.groupName} - لحد {formatDate(h.dueDate)}
                </span>
                <span className={`ui-badge mr-2 ${h.state === "OVERDUE" ? "bg-red-50 text-red-700" : h.state === "SUBMITTED" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {h.state === "OVERDUE" ? "متأخر ولم يُسلّم" : h.state === "SUBMITTED" ? "تم التسليم · في انتظار المراجعة" : "في انتظار التسليم"}
                </span>
                {h.description && <p className="mt-2 whitespace-pre-wrap text-slate-600">{h.description}</p>}
                {h.attachments?.length > 0 && <p className="mt-2 text-xs text-slate-500">{h.attachments.length} ملف مرفق</p>}
                {studentId && <Link href={`/parent/homework/${h.id}?student=${encodeURIComponent(studentId)}`} className="mt-2 inline-block text-blue-600 underline">تفاصيل الواجب والتسليم</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {checked.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {HOMEWORK_ORDER.map((s) => (
              <span key={s} className={`ui-badge ${HOMEWORK_BADGE[s]}`}>
                {HOMEWORK_LABELS[s]}: {counts[s]}
              </span>
            ))}
          </div>
          <ul className="ui-card divide-y divide-gray-200 text-sm">
            {checked.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-slate-800">{c.title}</span>{" "}
                  <span className="text-slate-500">- {formatDate(c.dueDate)}</span>
                  {showNotes && c.note && (
                    <span className="mt-1 block text-xs text-slate-500">{c.note}</span>
                  )}
                  {c.description && <span className="mt-1 block whitespace-pre-wrap text-xs text-slate-500">{c.description}</span>}
                  {studentId && c.homeworkId && <Link href={`/parent/homework/${c.homeworkId}?student=${encodeURIComponent(studentId)}`} className="mt-2 block text-xs text-blue-600 underline">عرض الواجب والتسليم</Link>}
                </span>
                <span className={`ui-badge shrink-0 ${HOMEWORK_BADGE[c.status]}`}>
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
