import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getStudentDetail } from "@/lib/data/students";
import { getStudentAttendance } from "@/lib/data/attendance";
import { getStudentHomework } from "@/lib/data/homework";
import { getStudentExams } from "@/lib/data/exams";
import HomeworkSummary from "@/components/homework-summary";
import GradesSummary from "@/components/grades-summary";
import AttendanceSummary from "@/components/attendance-summary";
import {
  GRADE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatMonth,
  formatDay,
  egp,
} from "@/lib/labels";
import { cairoMonth, shiftMonth, lastMonths } from "@/lib/time";
import { getStudentPaymentHistory } from "@/lib/data/payments";
import PaymentHistory from "@/components/payment-history";
import {
  recordPaymentAction,
  deletePaymentAction,
} from "@/app/teacher/actions";
import { input, button, dangerButton, card } from "@/app/teacher/ui";
import { setStudentLoginEmailAction } from "@/app/teacher/student-actions";
import StudentEditForm from "../student-edit-form";
import LifecycleForm from "../lifecycle-form";

export default async function StudentPage({ params }) {
  await requireRole("TEACHER");
  const { studentId } = await params;

  const student = await getStudentDetail(studentId);
  if (!student) notFound();

  const attendance = await getStudentAttendance(studentId, 20);
  const homework = await getStudentHomework(studentId, 15);
  const exams = await getStudentExams(studentId, 15);
  const payments = await getStudentPaymentHistory(studentId);
  const currentMonth = cairoMonth();
  const monthOptions = lastMonths(shiftMonth(currentMonth, 1), 8);
  const backTo = `/teacher/students/${student.id}`;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/teacher/students" className="text-sm text-gray-500 hover:text-blue-600">
          رجوع للطلاب
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {student.name}{" "}
          <span className="text-base font-normal text-gray-500">
            ({GRADE_LABELS[student.gradeLevel]})
          </span>
        </h1>
        {student.studentPhone && (
          <p className="mt-1 text-sm text-gray-500">
            رقم الطالب: <span dir="ltr">{student.studentPhone}</span>
          </p>
        )}
        {student.notes && <p className="mt-1 text-sm text-gray-500">ملاحظات: {student.notes}</p>}
        {student.archivedAt && <p className="mt-2 text-sm text-amber-600">الطالب مؤرشف. كل السجل محفوظ، والتسجيل الجديد متوقف لحد الاسترجاع.</p>}
      </div>

      <StudentEditForm student={{ id: student.id, name: student.name, gradeLevel: student.gradeLevel, studentPhone: student.studentPhone, notes: student.notes }} />
      <LifecycleForm recordId={student.id} archived={Boolean(student.archivedAt)} />

      {/* Groups */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">المجموعات</h2>
        {student.enrollments.length === 0 ? (
          <p className="text-sm text-gray-500">
            الطالب مش في أي مجموعة. ضيفه من صفحة المجموعة.
          </p>
        ) : (
          <ul className={card}>
            {student.enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2">
                <Link href={`/teacher/groups/${e.group.id}`} className="hover:underline">
                  {e.group.name}
                </Link>
                <span className="text-sm text-gray-500">
                  {e.endedAt && <span className="block">انتهى التسجيل: {formatDay(e.endedAt)}</span>}
                  {egp(e.monthlyFee ?? e.group.monthlyFee)}
                  {e.monthlyFee !== null && " (اشتراك خاص)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Attendance */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الحضور</h2>
        <AttendanceSummary summary={attendance} showNotes />
      </section>

      {/* Homework */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الواجبات</h2>
        <HomeworkSummary data={homework} showNotes />
      </section>

      {/* Grades */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الدرجات</h2>
        <GradesSummary rows={exams} showNotes />
      </section>

      {/* Payments */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">الاشتراكات</h2>
        <PaymentHistory history={payments.history} />

        <form action={recordPaymentAction} className="ui-form flex flex-wrap items-end gap-3">
          <input type="hidden" name="studentId" value={student.id} />
          <input type="hidden" name="returnTo" value={backTo} />
          <label className="flex flex-col gap-1 text-sm">
            الشهر
            <select name="month" defaultValue={currentMonth} className={input}>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            المبلغ (جنيه)
            <input name="amount" type="number" min="1" step="1" required className={`${input} w-28`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            طريقة الدفع
            <select name="method" className={input}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ملاحظة (اختياري)
            <input name="note" className={input} />
          </label>
          <button type="submit" className={button}>
            تسجيل دفعة
          </button>
        </form>

        {payments.payments.length > 0 && (
          <ul className={card}>
            {payments.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  {egp(p.amount)} - {PAYMENT_METHOD_LABELS[p.method]}{" "}
                  <span className="text-gray-500">
                    عن {formatMonth(p.month)} ({formatDay(p.paidAt)})
                  </span>
                  {p.note && <span className="block text-xs text-gray-500">{p.note}</span>}
                </span>
                <form action={deletePaymentAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="returnTo" value={backTo} />
                  <button type="submit" className={dangerButton}>
                    مسح
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ui-panel space-y-3">
        <h2 className="text-lg font-semibold">حساب الطالب</h2>
        <p className="text-sm text-gray-500">حدد إيميل الطالب المسجل في Clerk. لازم الطالب يحقق الإيميل قبل ما يقدر يفتح بياناته. إزالة الإيميل توقف وصوله فورًا.</p>
        <form action={setStudentLoginEmailAction} className="ui-form flex flex-wrap items-end gap-2">
          <input type="hidden" name="studentId" value={student.id}/>
          <label className="flex flex-col gap-1 text-sm">البريد الإلكتروني
            <input type="email" name="loginEmail" defaultValue={student.loginEmail ?? ""} maxLength={254} className={input} placeholder="student@example.com"/>
          </label>
          <button className={button} type="submit">حفظ حساب الطالب</button>
        </form>
        <p className="text-sm">{student.account ? "الحساب مربوط بالفعل" : student.loginEmail ? "بانتظار تسجيل الطالب بالبريد المعتمد" : "لم يتم تخصيص حساب بعد"}</p>
      </section>
    </div>
  );
}
