import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getHomeworkSheet } from "@/lib/data/homework";
import { HOMEWORK_ORDER, HOMEWORK_LABELS, HOMEWORK_CHOICE, formatDate } from "@/lib/labels";
import { saveHomeworkAction, deleteHomeworkAction } from "@/app/teacher/actions";
import { input, button, dangerButton } from "@/app/teacher/ui";

export default async function HomeworkSheetPage({ params, searchParams }) {
  await requireRole("TEACHER");
  const { homeworkId } = await params;
  const query = await searchParams;

  const sheet = await getHomeworkSheet(homeworkId);
  if (!sheet) notFound();
  const saved = query?.saved === "1";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/teacher/homework" className="text-sm text-gray-500 hover:text-blue-600">
          رجوع للواجبات
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{sheet.homework.title}</h1>
            <p className="text-gray-500">
              {sheet.homework.groupName} - التسليم لحد {formatDate(sheet.homework.dueDate)}
            </p>
            {sheet.homework.description && (
              <p className="mt-1 text-sm text-gray-500">{sheet.homework.description}</p>
            )}
          </div>
          <form action={deleteHomeworkAction}>
            <input type="hidden" name="homeworkId" value={sheet.homework.id} />
            <input type="hidden" name="groupId" value={sheet.homework.groupId} />
            <button type="submit" className={dangerButton}>
              مسح الواجب
            </button>
          </form>
        </div>
      </div>

      {saved && (
        <p className="rounded bg-green-600/15 px-4 py-3 text-sm text-green-600">اتحفظت المراجعة.</p>
      )}

      {sheet.students.length === 0 ? (
        <p className="text-gray-500">مفيش طلاب في المجموعة دي.</p>
      ) : (
        <form action={saveHomeworkAction} className="space-y-4">
          <input type="hidden" name="homeworkId" value={sheet.homework.id} />

          <p className="text-sm text-gray-500">الكل عامل الواجب افتراضيًا. غيّر اللي ناقص أو معملوش.</p>

          <ul className="divide-y divide-gray-300 rounded border border-gray-300">
            {sheet.students.map((s) => (
              <li key={s.id} className="space-y-2 px-4 py-3">
                <input type="hidden" name="studentId" value={s.id} />
                <div className="font-medium">{s.name}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {HOMEWORK_ORDER.map((status) => (
                    <label key={status} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`status_${s.id}`}
                        value={status}
                        defaultChecked={(s.status ?? "DONE") === status}
                        className="peer sr-only"
                      />
                      <span
                        className={`block rounded border border-gray-400 px-3 py-1 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${HOMEWORK_CHOICE[status]}`}
                      >
                        {HOMEWORK_LABELS[status]}
                      </span>
                    </label>
                  ))}
                  <input
                    name={`note_${s.id}`}
                    defaultValue={s.note}
                    placeholder="ملاحظة (اختياري)"
                    className={`${input} min-w-40 flex-1`}
                  />
                </div>
              </li>
            ))}
          </ul>

          <button type="submit" className={button}>
            حفظ المراجعة
          </button>
        </form>
      )}
    </div>
  );
}
