import { prisma } from "@/lib/prisma";
import { cairoMonth, cairoMonthOf, isValidMonth, shiftMonth } from "@/lib/time";
import { buildChargeRows, summarize, chargeHistory } from "@/lib/billing";
import { notifyPaymentReminder } from "@/lib/notify";

export async function lockBilling(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('teacher-billing', 0))`;
}

export async function snapshotCharges(tx, throughMonth = cairoMonth(), filter = {}) {
  if (!isValidMonth(throughMonth)) throw new Error("الشهر غير صالح.");
  const last = throughMonth > cairoMonth() ? cairoMonth() : throughMonth;
  const enrollments = await tx.enrollment.findMany({ where: filter, include: { group: true } });
  const data = [];
  for (const e of enrollments) {
    const end = e.endedAt && cairoMonthOf(e.endedAt) < last ? cairoMonthOf(e.endedAt) : last;
    for (let month = cairoMonthOf(e.joinedAt); month <= end; month = shiftMonth(month, 1)) {
      data.push({ studentId: e.studentId, groupId: e.groupId, month, amount: e.monthlyFee ?? e.group.monthlyFee, groupName: e.group.name });
    }
  }
  if (data.length) await tx.monthlyCharge.createMany({ data, skipDuplicates: true });
}

async function prepareCharges() {
  await prisma.$transaction(async (tx) => { await lockBilling(tx); await snapshotCharges(tx); }, { timeout: 30000 });
}

async function chargesAndPayments(studentId = null, throughMonth = cairoMonth()) {
  await prepareCharges();
  const where = { ...(studentId && { studentId }), month: { lte: throughMonth } };
  const include = { student: { select: { id: true, name: true, archivedAt: true } } };
  const [charges, payments] = await Promise.all([
    prisma.monthlyCharge.findMany({ where, include }),
    prisma.payment.findMany({ where, include, orderBy: { paidAt: "desc" } }),
  ]);
  if (throughMonth > cairoMonth()) {
    const enrollments = await prisma.enrollment.findMany({ where: { ...(studentId && { studentId }), endedAt: null, student: { archivedAt: null }, group: { archivedAt: null } }, include: { student: include.student, group: true } });
    for (let month = shiftMonth(cairoMonth(), 1); month <= throughMonth; month = shiftMonth(month, 1)) {
      for (const e of enrollments) charges.push({ studentId: e.studentId, groupId: e.groupId, month, amount: e.monthlyFee ?? e.group.monthlyFee, groupName: e.group.name, student: e.student });
    }
  }
  return { charges, payments };
}

export async function getMonthOverview(month, groupId = null) {
  if (!isValidMonth(month)) throw new Error("الشهر غير صالح.");
  const { charges, payments } = await chargesAndPayments(null, month);
  const rows = buildChargeRows(charges, payments, month, groupId);
  return { rows, totals: { ...summarize(rows), collected: rows.reduce((s, r) => s + r.collected, 0) }, estimated: month > cairoMonth() };
}

export async function getStudentPaymentHistory(studentId, monthsBack = 0) {
  const { charges, payments } = await chargesAndPayments(studentId);
  const all = chargeHistory(charges, payments).reverse();
  return { history: monthsBack ? all.slice(0, monthsBack) : all, payments, charges };
}

export async function recordPayment({ studentId, month, amount, method, note, kind = "PAYMENT", providerReference = null }) {
  if (!isValidMonth(month) || !Number.isSafeInteger(amount) || amount <= 0 || !["PAYMENT", "REFUND", "CREDIT"].includes(kind) || !["CASH", "WALLET", "INSTAPAY", "OTHER"].includes(method)) throw new Error("بيانات الدفعة غير صالحة.");
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    await snapshotCharges(tx, cairoMonth(), { studentId });
    const student = await tx.student.findUnique({ where: { id: studentId }, include: { enrollments: { where: { endedAt: null } } } });
    if (!student) throw new Error("الطالب غير موجود.");
    if (kind === "REFUND") {
      const paid = await tx.payment.findMany({ where: { studentId, month } });
      const refundable = paid.filter((p) => p.kind !== "CREDIT").reduce((s, p) => s + (p.kind === "REFUND" ? -p.amount : p.amount), 0);
      if (amount > refundable) throw new Error("قيمة الاسترداد تتجاوز المدفوع لهذا الشهر.");
    }
    const groupId = student.enrollments.length === 1 ? student.enrollments[0].groupId : null;
    return tx.payment.create({ data: { studentId, groupId, month, amount, method, note, kind, providerReference } });
  });
}

export async function deletePayment(paymentId) {
  return prisma.payment.deleteMany({ where: { id: paymentId, providerReference: null } });
}

export async function getStudentMonthStatus(studentId, month) {
  const { charges, payments } = await chargesAndPayments(studentId, month);
  return buildChargeRows(charges, payments, month)[0] ?? { due: 0, paid: 0, remaining: 0, status: "PAID" };
}

export async function sendManualPaymentReminder(studentId, month) {
  const [student, status] = await Promise.all([prisma.student.findUnique({ where: { id: studentId }, select: { name: true, studentPhone: true } }), getStudentMonthStatus(studentId, month)]);
  if (!student?.studentPhone) throw new Error("لا يوجد رقم هاتف مسجل لالطالب.");
  if (status.remaining <= 0) throw new Error("لا يوجد مبلغ مستحق لهذا الشهر.");
  await notifyPaymentReminder({ studentId, studentPhone: student.studentPhone, studentName: student.name, month, remaining: status.remaining, force: true });
}
