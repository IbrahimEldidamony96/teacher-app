import Link from "next/link";
import AppShell from "@/components/app-shell";
import AppIcon from "@/components/app-icon";
import { requireUser } from "@/lib/auth";
import { getTodaySlots } from "@/lib/data/timetable";
import { getAttendanceCountsForDate, getStudentAttendance } from "@/lib/data/attendance";
import { cairoNow, cairoToday, cairoMonth } from "@/lib/time";
import { DAY_LABELS, GRADE_LABELS, formatRange, formatMonth, egp } from "@/lib/labels";
import WeekSchedule from "@/components/week-schedule";
import AttendanceSummary from "@/components/attendance-summary";
import PaymentHistory from "@/components/payment-history";
import { getMonthOverview, getStudentPaymentHistory } from "@/lib/data/payments";
import HomeworkSummary from "@/components/homework-summary";
import GradesSummary from "@/components/grades-summary";
import { getStudentHomework } from "@/lib/data/homework";
import { getStudentExams } from "@/lib/data/exams";
import { prisma } from "@/lib/prisma";

const shortcuts = [
  ["groups", "المجموعات"],
  ["students", "الطلاب"],
  ["attendance", "الحضور"],
  ["classrooms", "حصص الفيديو", "video"],
  ["payments", "الاشتراكات"],
  ["homework", "الواجبات"],
  ["exams", "الدرجات"],
  ["schedule", "جدول الأسبوع", "calendar"],
];

function statusOf(slot, time, isNext) {
  if (slot.startTime <= time && time < slot.endTime) {
    return { label: "دلوقتي", cls: "bg-emerald-50 text-emerald-700" };
  }
  if (slot.endTime <= time) return { label: "خلصت", cls: "bg-slate-100 text-slate-600" };
  if (isNext) return { label: "الجاية", cls: "bg-blue-50 text-blue-700" };
  return { label: "لسه", cls: "bg-slate-100 text-slate-600" };
}


async function TeacherHome() {
  const { day, time } = cairoNow();
  const month = cairoMonth();
  const [slots, recorded, { totals }] = await Promise.all([
    getTodaySlots(day),
    getAttendanceCountsForDate(cairoToday()),
    getMonthOverview(month),
  ]);
  const owing = totals.counts.UNPAID + totals.counts.PARTIAL;
  const nextIndex = slots.findIndex((s) => s.startTime > time);
  const paidRate = totals.due > 0 ? Math.min(100, Math.max(0, (totals.paid / totals.due) * 100)) : 0;

  return (
    <>
      <div className="dashboard-stats">
        <div className="ui-panel dashboard-stat">
          <span className="dashboard-icon"><AppIcon name="calendar" size={22} /></span>
          <div><p className="text-xs text-gray-500">حصص النهاردة</p><strong className="dashboard-stat-value">{slots.length} <span className="text-sm font-normal text-gray-500">حصة</span></strong></div>
        </div>
        <div className="ui-panel dashboard-stat">
          <span className="dashboard-icon dashboard-icon-teal"><AppIcon name="payments" size={22} /></span>
          <div><p className="text-xs text-gray-500">المحصّل هذا الشهر</p><strong className="dashboard-stat-value">{egp(totals.paid)}</strong></div>
        </div>
        <div className="ui-panel dashboard-stat">
          <span className="dashboard-icon dashboard-icon-amber"><AppIcon name="students" size={22} /></span>
          <div><p className="text-xs text-gray-500">الاشتراكات المتبقية</p><strong className="dashboard-stat-value">{egp(totals.remaining)}</strong></div>
        </div>
      </div>

      <section className="ui-panel">
        <div className="dashboard-section-title">
          <h2 className="text-lg font-bold">حصص النهاردة <span className="text-sm font-normal text-gray-500">({DAY_LABELS[day]})</span></h2>
          <Link href="/teacher/schedule" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">جدول الأسبوع <AppIcon name="arrow" size={16} /></Link>
        </div>
        {slots.length === 0 ? (
          <p className="ui-empty">مفيش حصص النهاردة.</p>
        ) : (
          <ul className="space-y-2">
            {slots.map((slot, i) => {
              const status = statusOf(slot, time, i === nextIndex);
              const count = recorded.get(slot.group.id) ?? 0;
              return (
                <li key={slot.id} className="dashboard-lesson">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/teacher/groups/${slot.group.id}`}
                        className="font-medium hover:underline"
                      >
                        {slot.group.name}
                      </Link>
                      <span className="block text-sm text-gray-500">
                        {GRADE_LABELS[slot.group.gradeLevel]} - {slot.group._count.enrollments} طالب
                      </span>
                      <span className="block text-sm text-gray-500">
                        {formatRange(slot.startTime, slot.endTime)}
                        {slot.location && ` - ${slot.location}`}
                      </span>
                    </div>
                    <span className={`ui-badge shrink-0 ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link href={`/teacher/attendance/${slot.group.id}`} className="ui-button">
                      <AppIcon name="attendance" size={16} />
                      تسجيل الحضور
                    </Link>
                    {count > 0 ? (
                      <span className="text-sm text-green-600">اتسجل ({count} طالب)</span>
                    ) : (
                      <span className="text-sm text-gray-500">الحضور لسه متسجلش</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">اشتراكات {formatMonth(month)}</h2>
          <Link href="/teacher/payments" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
            التفاصيل <AppIcon name="arrow" size={16} />
          </Link>
        </div>
        <p className="text-sm">
          اتحصّل {egp(totals.paid)} من {egp(totals.due)} - المتبقي{" "}
          <strong className="text-red-500">{egp(totals.remaining)}</strong>
          {owing > 0 && <span className="text-gray-500"> ({owing} طالب لسه)</span>}
        </p>
        <div className="ui-progress" role="meter" aria-label="نسبة تحصيل الاشتراكات" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paidRate)}>
          <span className="ui-progress-fill" style={{ width: `${paidRate}%` }} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">وصول سريع</h2>
        <div className="dashboard-shortcuts">
          {shortcuts.map(([path, label, icon]) => (
            <Link key={path} href={`/teacher/${path}`} className="dashboard-shortcut">
              <AppIcon name={icon ?? path} />{label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}


async function StudentHome({user}) {
  const studentId = user.studentProfile.id;
  const [student, attendance, payments, homework, exams] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { enrollments: { where: { endedAt: null, group: { archivedAt: null } },
        include: { group: { select: { id: true, name: true, gradeLevel: true, slots: true } } } } },
    }),
    getStudentAttendance(studentId),
    getStudentPaymentHistory(studentId),
    getStudentHomework(studentId),
    getStudentExams(studentId),
  ]);
  if (!student || student.archivedAt) return <p className="ui-empty">حساب الطالب غير متاح.</p>;
  const groups = student.enrollments.map(e => e.group);
  return <div className="space-y-7">
    <div className="ui-panel space-y-2">
      <h2 className="text-lg font-semibold">مرحبًا {student.name}</h2>
      <p className="text-sm text-gray-500">{GRADE_LABELS[student.gradeLevel]} · {groups.map(g => g.name).join("، ") || "لم تُسجل في مجموعة بعد"}</p>
    </div>
    <section className="ui-panel space-y-3">
      <h2 className="font-semibold">مواعيد الحصص</h2>
      <WeekSchedule slots={groups.flatMap(group => group.slots.map(slot => ({...slot,group})))}/>
      <Link className="text-sm text-blue-600 underline" href="/student/classrooms">الحصص الأونلاين والتسجيلات</Link>
    </section>
    <section className="ui-panel space-y-3"><h2 className="font-semibold">الحضور</h2><AttendanceSummary summary={attendance}/></section>
    <section className="ui-panel space-y-3"><h2 className="font-semibold">الاشتراكات</h2><PaymentHistory history={payments.history}/></section>
    <section className="ui-panel space-y-3"><h2 className="font-semibold">الواجبات</h2><HomeworkSummary data={homework} studentId={studentId}/></section>
    <section className="ui-panel space-y-3"><h2 className="font-semibold">الدرجات</h2><GradesSummary rows={exams}/></section>
  </div>;
}
export default async function DashboardPage(){
  const user = await requireUser();
  return <AppShell teacher={user.role === "TEACHER"}>
    <div className="space-y-7">
      <header className="dashboard-welcome"><div>
        <p className="mb-1 text-sm text-gray-500">{user.role === "TEACHER" ? "كل تفاصيل يومك في مكان واحد" : "تابع دروسك ونتائجك"}</p>
        <h1>أهلًا {user.name} <span className="text-blue-600">،</span></h1>
      </div><span className="dashboard-date"><AppIcon name="calendar" size={18}/>{DAY_LABELS[cairoNow().day]} · {formatMonth(cairoMonth())}</span></header>
      {user.role === "TEACHER" ? <TeacherHome/> : <StudentHome user={user}/>}
    </div>
  </AppShell>;
}
