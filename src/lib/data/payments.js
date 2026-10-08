import { prisma } from "@/lib/prisma";
import { cairoMonth, lastMonths } from "@/lib/time";
import { buildMonthRows, summarize, buildHistory, dueForMonth, statusOf } from "@/lib/billing";
import { notifyPaymentReminder } from "@/lib/notify";

const enrollmentInclude = {
  student: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, monthlyFee: true } },
};

// Every student's due / paid / status for one month (optionally only one group's students)
export async function getMonthOverview(month, groupId = null) {
  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({ include: enrollmentInclude }),
    prisma.payment.findMany({ where: { month } }),
  ]);

  const rows = buildMonthRows(enrollments, payments, month, groupId);
  return { rows, totals: summarize(rows) };
}

// Recent months' status plus the latest payments, for one student
export async function getStudentPaymentHistory(studentId, monthsBack = 6) {
  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId }, include: enrollmentInclude }),
    prisma.payment.findMany({ where: { studentId }, orderBy: { paidAt: "desc" } }),
  ]);

  return {
    history: buildHistory(enrollments, payments, lastMonths(cairoMonth(), monthsBack)),
    payments: payments.slice(0, 30),
  };
}

// Only children linked to this parent are ever loaded. Returns Map(studentId -> history rows)
export async function listChildrenPayments(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    select: { studentId: true },
  });
  const pairs = await Promise.all(
    links.map(async (l) => [l.studentId, (await getStudentPaymentHistory(l.studentId)).history])
  );
  return new Map(pairs);
}

export async function recordPayment({ studentId, month, amount, method, note }) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { enrollments: { select: { groupId: true } } },
  });
  if (!student) throw new Error("الطالب مش موجود.");

  // Link the payment to a group only when it is unambiguous
  const groupId = student.enrollments.length === 1 ? student.enrollments[0].groupId : null;

  return prisma.payment.create({
    data: { studentId, groupId, month, amount, method, note },
  });
}

export function deletePayment(paymentId) {
  return prisma.payment.deleteMany({ where: { id: paymentId } });
}

// One student's due / paid / status for a single month - used by the attendance
// flow to decide whether an automatic payment reminder should go out.
export async function getStudentMonthStatus(studentId, month) {
  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId }, include: enrollmentInclude }),
    prisma.payment.findMany({ where: { studentId, month } }),
  ]);

  const due = dueForMonth(enrollments, month);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  return { due, paid, remaining: Math.max(due - paid, 0), status: statusOf(due, paid) };
}

// Manual "send reminder" button on the payments page - always sends, even if an
// automatic reminder already went out this month.
export async function sendManualPaymentReminder(studentId, month) {
  const [student, status] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { name: true, parentPhone: true } }),
    getStudentMonthStatus(studentId, month),
  ]);
  if (!student) throw new Error("الطالب مش موجود.");
  if (!student.parentPhone) throw new Error("مفيش رقم تليفون لولي الأمر مسجل لهذا الطالب.");

  await notifyPaymentReminder({
    studentId,
    studentPhone: student.parentPhone,
    studentName: student.name,
    month,
    remaining: status.remaining,
    force: true,
  });
}
