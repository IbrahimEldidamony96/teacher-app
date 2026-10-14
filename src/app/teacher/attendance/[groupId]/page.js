import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getSessionAttendance } from "@/lib/data/attendance";
import { cairoToday, isValidDateString, weekdayOf } from "@/lib/time";
import {
  ATTENDANCE_ORDER,
  ATTENDANCE_LABELS,
  ATTENDANCE_CHOICE,
  GRADE_LABELS,
  DAY_LABELS,
  formatDate,
} from "@/lib/labels";
import { saveAttendanceAction } from "@/app/teacher/actions";
import { input, button } from "@/app/teacher/ui";

export default async function AttendanceSheetPage({ params, searchParams }) {
  await requireRole("TEACHER");
  const { groupId } = await params;
  const query = await searchParams;

  // Default to today (Cairo). Future dates are not allowed.
  const today = cairoToday();
  const requested = typeof query?.date === "string" ? query.date : today;
  const date = isValidDateString(requested) && requested <= today ? requested : today;
  const saved = query?.saved === "1";

  const session = await getSessionAttendance(groupId, date);
  if (!session) notFound();

  const weekday = weekdayOf(date);
  const offSchedule = !session.group.slotDays.includes(weekday);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/teacher/attendance" className="text-sm text-gray-500 hover:text-blue-600">
          رجوع للحضور
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {session.group.name}{" "}
          <span className="text-base font-normal text-gray-500">
            ({GRADE_LABELS[session.group.gradeLevel]})
          </span>
        </h1>
        <p className="mt-1 text-gray-500">{formatDate(date)}</p>
      </div>

      {/* Pick another date (GET form: reloads this page with ?date=) */}
      <form method="get" className="ui-form flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          التاريخ
          <input type="date" name="date" defaultValue={date} max={today} required className={input} />
        </label>
        <button type="submit" className="ui-button-secondary">
          عرض
        </button>
      </form>

      {saved && (
        <p className="rounded bg-green-600/15 px-4 py-3 text-sm text-green-600">
          اتحفظ الحضور.
        </p>
      )}

      {offSchedule && (
        <p className="rounded bg-amber-500/15 px-4 py-3 text-sm text-amber-600">
          مفيش حصة للمجموعة دي يوم {DAY_LABELS[weekday]} في الجدول. لو ده تعويض كمّل عادي.
        </p>
      )}

      {session.students.length === 0 ? (
        <p className="ui-empty">
          مفيش طلاب في المجموعة دي. ضيفهم من{" "}
          <Link href={`/teacher/groups/${session.group.id}`} className="underline">
            صفحة المجموعة
          </Link>
          .
        </p>
      ) : (
        <form action={saveAttendanceAction} className="space-y-4">
          <input type="hidden" name="groupId" value={session.group.id} />
          <input type="hidden" name="date" value={date} />

          <p className="text-sm text-gray-500">
            الكل حاضر افتراضيًا. غيّر اللي غايب أو متأخر وبعدين احفظ.
          </p>
          <p className="text-xs text-gray-500">
            هيتبعت واتساب تلقائي لولي أمر أي طالب غايب، وتذكير اشتراك لو لسه ما دفعش شهر ده (مرة واحدة بس في الشهر).
          </p>

          <ul className="ui-card divide-y divide-gray-200">
            {session.students.map((s) => (
              <li key={s.id} className="space-y-2 px-4 py-3">
                <input type="hidden" name="studentId" value={s.id} />
                <div className="font-medium">{s.name}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {ATTENDANCE_ORDER.map((status) => (
                    <label key={status} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`status_${s.id}`}
                        value={status}
                        defaultChecked={(s.status ?? "PRESENT") === status}
                        className="peer sr-only"
                      />
                      <span
                        className={`block rounded border border-gray-400 px-3 py-1 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${ATTENDANCE_CHOICE[status]}`}
                      >
                        {ATTENDANCE_LABELS[status]}
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
            حفظ الحضور
          </button>
        </form>
      )}
    </div>
  );
}
