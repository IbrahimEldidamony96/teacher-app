import { requireRole } from "@/lib/auth";
import { listAllSlots } from "@/lib/data/timetable";
import WeekSchedule from "@/components/week-schedule";

export default async function SchedulePage() {
  await requireRole("TEACHER");
  const slots = await listAllSlots();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">جدول الأسبوع</h1>
      <p className="text-sm text-gray-500">
        بتضيف الحصص من صفحة كل مجموعة. النظام بيمنع أي حصتين يتعارضوا في الوقت.
      </p>
      <WeekSchedule slots={slots} />
    </div>
  );
}
