import { cairoMonthOf } from "@/lib/time";

// Pure billing logic, kept free of database calls so it is easy to test.
// An enrollment looks like { studentId, groupId, monthlyFee, joinedAt, student, group }.

const feeOf = (enrollment) => enrollment.monthlyFee ?? enrollment.group.monthlyFee;

// Fees due for a month: only enrollments that had already started by then
export function dueForMonth(enrollments, month) {
  return enrollments
    .filter((e) => cairoMonthOf(e.joinedAt) <= month && (!e.endedAt || cairoMonthOf(e.endedAt) >= month))
    .reduce((sum, e) => sum + feeOf(e), 0);
}

export function statusOf(due, paid) {
  if (paid >= due) return "PAID";
  if (paid <= 0) return "UNPAID";
  return "PARTIAL";
}

export function paymentValue(payment) {
  return payment.kind === "REFUND" ? -payment.amount : payment.amount;
}

export function chargeHistory(charges, payments) {
  const months = [...new Set([...charges.map((c) => c.month), ...payments.map((p) => p.month)])].sort();
  let credit = 0;
  return months.map((month) => {
    const due = charges.filter((c) => c.month === month).reduce((s, c) => s + c.amount, 0);
    const monthPayments = payments.filter((p) => p.month === month);
    const paidThisMonth = monthPayments.reduce((s, p) => s + paymentValue(p), 0);
    const collected = monthPayments.filter((p) => p.kind !== "CREDIT").reduce((s, p) => s + paymentValue(p), 0);
    const creditIn = credit;
    const paid = paidThisMonth + creditIn;
    credit = Math.max(0, paid - due);
    return { month, due, paid, paidThisMonth, collected, creditIn, creditOut: credit, remaining: Math.max(0, due - paid), status: statusOf(due, paid) };
  });
}

export function buildChargeRows(charges, payments, month, groupId = null) {
  const ids = new Set([...charges.map((c) => c.studentId), ...payments.map((p) => p.studentId)]);
  const rows = [];
  for (const id of ids) {
    const ownCharges = charges.filter((c) => c.studentId === id && c.month <= month);
    const ownPayments = payments.filter((p) => p.studentId === id && p.month <= month);
    if (groupId && !ownCharges.some((c) => c.groupId === groupId && c.month === month)) continue;
    const student = ownCharges[0]?.student ?? ownPayments[0]?.student;
    if (!student) continue;
    const history = chargeHistory([...ownCharges, { studentId: id, month, amount: 0 }], ownPayments);
    const row = history.find((r) => r.month === month);
    if (row.due === 0 && row.paid === 0) continue;
    rows.push({ ...row, student, groups: [...new Set(ownCharges.filter((c) => c.month === month).map((c) => c.groupName))] });
  }
  const order = { UNPAID: 0, PARTIAL: 1, PAID: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, "ar"));
}

// One row per student for a month. Optionally only students in a given group.
export function buildMonthRows(enrollments, payments, month, groupId = null) {
  const byStudent = new Map();
  for (const e of enrollments) {
    const list = byStudent.get(e.student.id) ?? [];
    list.push(e);
    byStudent.set(e.student.id, list);
  }

  const paidBy = new Map();
  for (const p of payments) {
    paidBy.set(p.studentId, (paidBy.get(p.studentId) ?? 0) + p.amount);
  }

  const rows = [];
  for (const list of byStudent.values()) {
    if (groupId && !list.some((e) => e.groupId === groupId)) continue;

    const student = list[0].student;
    const due = dueForMonth(list, month);
    const paid = paidBy.get(student.id) ?? 0;
    if (due === 0 && paid === 0) continue;

    rows.push({
      student,
      groups: list.map((e) => e.group.name),
      due,
      paid,
      remaining: Math.max(due - paid, 0),
      status: statusOf(due, paid),
    });
  }

  // Unpaid first, then partial, then paid; by name inside each
  const order = { UNPAID: 0, PARTIAL: 1, PAID: 2 };
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name, "ar")
  );
  return rows;
}

export function summarize(rows) {
  const totals = { due: 0, paid: 0, remaining: 0, counts: { PAID: 0, PARTIAL: 0, UNPAID: 0 } };
  for (const r of rows) {
    totals.due += r.due;
    totals.paid += r.paid;
    totals.remaining += r.remaining;
    totals.counts[r.status] += 1;
  }
  return totals;
}

// A single student's month-by-month status (months with nothing due or paid are skipped)
export function buildHistory(enrollments, payments, months) {
  return months
    .map((month) => {
      const due = dueForMonth(enrollments, month);
      const paid = payments.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0);
      return { month, due, paid, status: statusOf(due, paid) };
    })
    .filter((r) => r.due > 0 || r.paid > 0);
}
