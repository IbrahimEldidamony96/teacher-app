import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { requireUser } from "@/lib/auth";
import { getTodaySlots, listChildrenSchedules } from "@/lib/data/timetable";
import { getAttendanceCountsForDate, listChildrenAttendance } from "@/lib/data/attendance";
import { cairoNow, cairoToday, cairoMonth } from "@/lib/time";
import { DAY_LABELS, GRADE_LABELS, formatRange, formatMonth, egp } from "@/lib/labels";
import WeekSchedule from "@/components/week-schedule";
import AttendanceSummary from "@/components/attendance-summary";
import PaymentHistory from "@/components/payment-history";
import { getMonthOverview, listChildrenPayments } from "@/lib/data/payments";
import HomeworkSummary from "@/components/homework-summary";
import GradesSummary from "@/components/grades-summary";
import { listChildrenHomework } from "@/lib/data/homework";
import { listChildrenExams } from "@/lib/data/exams";

const linkClass =
  "inline-block rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700";

function statusOf(slot, time, isNext) {
  if (slot.startTime <= time && time < slot.endTime) {
    return { label: "دلوقتي", cls: "bg-green-600 text-white" };
  }
  if (slot.endTime <= time) return { label: "خلصت", cls: "bg-gray-500/20 text-gray-500" };
  if (isNext) return { label: "الجاية", cls: "bg-blue-600 text-white" };
  return { label: "لسه", cls: "bg-gray-500/20" };
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

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">حصص النهاردة ({DAY_LABELS[day]})</h2>
        {slots.length === 0 ? (
          <p className="text-gray-500">مفيش حصص النهاردة.</p>
        ) : (
          <ul className="space-y-2">
            {slots.map((slot, i) => {
              const status = statusOf(slot, time, i === nextIndex);
              const count = recorded.get(slot.group.id) ?? 0;
              return (
                <li key={slot.id} className="rounded border border-gray-300 p-3">
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
                    <span className={`shrink-0 rounded px-2 py-1 text-xs ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link href={`/teacher/attendance/${slot.group.id}`} className={linkClass}>
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

      <section className="space-y-2 rounded border border-gray-300 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">اشتراكات {formatMonth(month)}</h2>
          <Link href="/teacher/payments" className="text-sm text-blue-600 underline">
            التفاصيل
          </Link>
        </div>
        <p className="text-sm">
          اتحصّل {egp(totals.paid)} من {egp(totals.due)} - المتبقي{" "}
          <strong className="text-red-500">{egp(totals.remaining)}</strong>
          {owing > 0 && <span className="text-gray-500"> ({owing} طالب لسه)</span>}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/teacher/groups" className={linkClass}>
          المجموعات
        </Link>
        <Link href="/teacher/students" className={linkClass}>
          الطلاب
        </Link>
        <Link href="/teacher/attendance" className={linkClass}>
          الحضور
        </Link>
        <Link href="/teacher/payments" className={linkClass}>
          الاشتراكات
        </Link>
        <Link href="/teacher/homework" className={linkClass}>
          الواجبات
        </Link>
        <Link href="/teacher/exams" className={linkClass}>
          الدرجات
        </Link>
        <Link href="/teacher/schedule" className={linkClass}>
          جدول الأسبوع
        </Link>
      </div>
    </>
  );
}

async function ParentHome({ user }) {
  const [children, attendanceByChild, paymentsByChild, homeworkByChild, examsByChild] = await Promise.all([
    listChildrenSchedules(user.id),
    listChildrenAttendance(user.id),
    listChildrenPayments(user.id),
    listChildrenHomework(user.id),
    listChildrenExams(user.id),
  ]);

  if (children.length === 0) {
    return (
      <p className="text-gray-500">
        لسه مفيش أبناء مربوطين بحسابك. كلّم المدرس علشان يربطهم بيك.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {children.map(({ student, slots }) => (
        <section key={student.id} className="space-y-4">
          <h2 className="text-lg font-semibold">
            {student.name}{" "}
            <span className="text-sm font-normal text-gray-500">
              ({GRADE_LABELS[student.gradeLevel]})
            </span>
          </h2>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">مواعيد الحصص</h3>
            <WeekSchedule slots={slots} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">الحضور</h3>
            <AttendanceSummary summary={attendanceByChild.get(student.id)} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">الاشتراكات</h3>
            <PaymentHistory history={paymentsByChild.get(student.id)} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">الواجبات</h3>
            <HomeworkSummary data={homeworkByChild.get(student.id)} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-500">الدرجات</h3>
            <GradesSummary rows={examsByChild.get(student.id)} />
          </div>
        </section>
      ))}
    </div>
  );
}

// Only requireUser here (not requireRole), because requireRole redirects to /dashboard
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">أهلًا {user.name}</h1>
        <UserButton />
      </header>
      {user.role === "TEACHER" ? <TeacherHome /> : <ParentHome user={user} />}
    </main>
  );
}
