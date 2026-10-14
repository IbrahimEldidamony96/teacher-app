import { requireRole } from "@/lib/auth";
import { listAllSlots, listScheduleExceptions } from "@/lib/data/timetable";
import { listGroups } from "@/lib/data/groups";
import { cairoToday } from "@/lib/time";
import { resolveScheduleForDate, scheduleDates } from "@/lib/schedule";
import ScheduleEditor from "@/components/schedule-editor";
import DatedSchedule from "@/components/dated-schedule";

export default async function SchedulePage() {
  await requireRole("TEACHER");
  const today = cairoToday();
  const [slots, exceptions, groups] = await Promise.all([listAllSlots(), listScheduleExceptions(), listGroups()]);
  const dates = scheduleDates(today, 14);
  const upcoming = dates.flatMap((date) => resolveScheduleForDate(slots, exceptions, date));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">جدول الأسبوع</h1>
      <p className="text-sm text-gray-500">
        عدّل المواعيد الأسبوعية أو غيّر حصة بتاريخ محدد. النظام بيمنع تعارض حصص المدرس بين كل المجموعات.
      </p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الحصص خلال الأسبوعين القادمين</h2>
        <DatedSchedule slots={upcoming} />
      </section>
      <ScheduleEditor groups={groups.filter((group) => !group.archivedAt)} slots={slots} exceptions={exceptions} today={today} />
    </div>
  );
}
