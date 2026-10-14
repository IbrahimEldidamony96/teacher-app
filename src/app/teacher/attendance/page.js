import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { getTodaySlots } from "@/lib/data/timetable";
import { getAttendanceCountsForDate } from "@/lib/data/attendance";
import { cairoNow, cairoToday } from "@/lib/time";
import { GRADE_LABELS, DAY_LABELS } from "@/lib/labels";
import { card } from "@/app/teacher/ui";

export default async function AttendanceIndexPage() {
  await requireRole("TEACHER");
  const { day } = cairoNow();
  const today = cairoToday();

  const [groups, todaySlots, counts] = await Promise.all([
    listGroups(),
    getTodaySlots(day),
    getAttendanceCountsForDate(today),
  ]);
  const hasSessionToday = new Set(todaySlots.map((s) => s.group.id));

  // Groups with a session today first
  const sorted = [...groups].sort(
    (a, b) => Number(hasSessionToday.has(b.id)) - Number(hasSessionToday.has(a.id))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">الحضور</h1>
      <p className="text-sm text-gray-500">
        اختار المجموعة. تقدر تسجّل حضور النهاردة ({DAY_LABELS[day]}) أو ترجع لأي يوم فات من جوه الصفحة.
      </p>

      {sorted.length === 0 ? (
        <p className="ui-empty">مفيش مجموعات لسه.</p>
      ) : (
        <ul className={card}>
          {sorted.map((g) => {
            const recorded = counts.get(g.id) ?? 0;
            return (
              <li key={g.id}>
                <Link
                  href={`/teacher/attendance/${g.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-500/10"
                >
                  <span className="font-medium">
                    {g.name}{" "}
                    <span className="text-sm font-normal text-gray-500">
                      ({GRADE_LABELS[g.gradeLevel]})
                    </span>
                  </span>
                  <span className="flex gap-2 text-xs">
                    {hasSessionToday.has(g.id) && (
                      <span className="ui-badge bg-blue-50 text-blue-700">
                        حصة النهاردة
                      </span>
                    )}
                    {recorded > 0 && (
                      <span className="ui-badge bg-emerald-50 text-emerald-700">
                        اتسجل النهاردة
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
