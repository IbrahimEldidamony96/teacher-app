import { requireRole } from "@/lib/auth";
import { getStudentSchedule } from "@/lib/data/timetable";
import AppShell from "@/components/app-shell";
import DatedSchedule from "@/components/dated-schedule";
import WeekSchedule from "@/components/week-schedule";

export default async function StudentSchedulePage() {
  const user = await requireRole("STUDENT");
  const schedule = await getStudentSchedule(user.studentProfile.id);
  return <AppShell teacher={false}>
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">جدول حصصي</h1>
      <section className="ui-panel space-y-3">
        <h2 className="font-semibold">الحصص خلال الأسبوعين الجايين</h2>
        <DatedSchedule slots={schedule.upcomingSlots} exceptions={schedule.exceptions}/>
      </section>
      <section className="ui-panel space-y-3">
        <h2 className="font-semibold">جدول الأسبوع المعتاد</h2>
        <WeekSchedule slots={schedule.slots}/>
      </section>
    </div>
  </AppShell>;
}
