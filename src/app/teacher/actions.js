"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { GRADE_ORDER, DAY_ORDER, ATTENDANCE_ORDER, HOMEWORK_ORDER, PAYMENT_METHODS } from "@/lib/labels";
import { cairoToday, isValidDateString, isValidMonth } from "@/lib/time";
import { normalizeParentPhone, normalizeStudentName } from "@/lib/student-identity";
import { createGroup, updateGroup, enrollStudent, unenrollStudent } from "@/lib/data/groups";
import { createStudent, linkParent, unlinkParent } from "@/lib/data/students";
import { addSlot, deleteSlot } from "@/lib/data/timetable";
import { saveAttendance } from "@/lib/data/attendance";
import { recordPayment, deletePayment, sendManualPaymentReminder } from "@/lib/data/payments";
import { createHomework, deleteHomework, saveHomeworkResults } from "@/lib/data/homework";
import { createExam, deleteExam, saveExamResults } from "@/lib/data/exams";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE = /^\d{8,15}$/;

function text(formData, key) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function required(value, label) {
  if (!value) throw new Error(`${label} مطلوب.`);
  return value;
}

// Empty -> null, otherwise a whole number of pounds >= 0
function money(formData, key) {
  const raw = text(formData, key);
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error("المبلغ لازم يكون رقم صحيح.");
  return n;
}

// Any positive number (decimals allowed) - for things like an exam's max score, not money
function positiveNumber(formData, key, label) {
  const raw = text(formData, key);
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} لازم يكون رقم أكبر من صفر.`);
  return n;
}

function gradeLevel(formData) {
  const value = text(formData, "gradeLevel");
  if (!GRADE_ORDER.includes(value)) throw new Error("اختار الصف الدراسي.");
  return value;
}

function refresh() {
  revalidatePath("/teacher", "layout");
  revalidatePath("/dashboard");
}

// ───────── Groups ─────────

export async function createGroupAction(formData) {
  await requireRole("TEACHER");
  const name = required(text(formData, "name"), "اسم المجموعة");
  const created = await createGroup({
    name,
    gradeLevel: gradeLevel(formData),
    monthlyFee: money(formData, "monthlyFee") ?? 0,
  });

  refresh();
  redirect(`/teacher/groups/${created.id}`);
}

export async function updateGroupAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const name = required(text(formData, "name"), "اسم المجموعة");

  await updateGroup(groupId, { name, monthlyFee: money(formData, "monthlyFee") ?? 0 });
  refresh();
}

export async function enrollStudentAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const studentId = required(text(formData, "studentId"), "الطالب");

  await enrollStudent(groupId, studentId, money(formData, "monthlyFee"));
  refresh();
}

export async function unenrollStudentAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const studentId = required(text(formData, "studentId"), "الطالب");

  await unenrollStudent(groupId, studentId);
  refresh();
}

// ───────── Students ─────────

export async function createStudentAction(_previousState, formData) {
  await requireRole("TEACHER");
  const name = normalizeStudentName(text(formData, "name"));
  if (!name) return { message: "اسم الطالب مطلوب.", existingStudentId: null };
  const rawPhone = text(formData, "parentPhone");
  const parentPhone = normalizeParentPhone(rawPhone);
  if (rawPhone && !PHONE.test(parentPhone ?? "")) {
    return { message: "رقم التليفون مش مظبوط.", existingStudentId: null };
  }
  const studentGrade = text(formData, "gradeLevel");
  if (!GRADE_ORDER.includes(studentGrade)) {
    return { message: "اختار الصف الدراسي.", existingStudentId: null };
  }
  const groupId = text(formData, "groupId");

  let result;
  try {
    result = await createStudent({
      name,
      gradeLevel: studentGrade,
      parentPhone,
      notes: text(formData, "notes") || null,
      groupId: groupId || undefined,
    });
  } catch (error) {
    if (groupId && ["P2025", "P2003", "GROUP_ARCHIVED", "GROUP_MISSING"].includes(error?.code)) {
      return { message: "المجموعة مش موجودة. اختار مجموعة تانية.", existingStudentId: null };
    }
    throw error;
  }
  if (!result.created) {
    return {
      message: "الطالب ده مسجل بالفعل بنفس الاسم ورقم ولي الأمر.",
      existingStudentId: result.student.id,
    };
  }

  refresh();
  redirect(`/teacher/students/${result.student.id}`);
}

export async function linkParentAction(formData) {
  await requireRole("TEACHER");
  const studentId = required(text(formData, "studentId"), "الطالب");
  const parentId = required(text(formData, "parentId"), "ولي الأمر");

  await linkParent(studentId, parentId);
  refresh();
}

export async function unlinkParentAction(formData) {
  await requireRole("TEACHER");
  const studentId = required(text(formData, "studentId"), "الطالب");
  const parentId = required(text(formData, "parentId"), "ولي الأمر");

  await unlinkParent(studentId, parentId);
  refresh();
}

// ───────── Weekly schedule ─────────

export async function addSlotAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const day = text(formData, "day");
  const startTime = text(formData, "startTime");
  const endTime = text(formData, "endTime");

  if (!DAY_ORDER.includes(day)) throw new Error("اختار اليوم.");
  if (!TIME.test(startTime) || !TIME.test(endTime)) throw new Error("اكتب وقت البداية والنهاية.");
  if (endTime <= startTime) throw new Error("وقت النهاية لازم يكون بعد البداية.");

  await addSlot({ groupId, day, startTime, endTime, location: text(formData, "location") });
  refresh();
}

export async function deleteSlotAction(formData) {
  await requireRole("TEACHER");
  const slotId = required(text(formData, "slotId"), "الحصة");

  await deleteSlot(slotId);
  refresh();
}

// ───────── Attendance ─────────

export async function saveAttendanceAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const date = text(formData, "date");
  if (!isValidDateString(date) || date > cairoToday()) {
    throw new Error("التاريخ مش مظبوط.");
  }

  const studentIds = formData.getAll("studentId").filter((v) => typeof v === "string");
  if (studentIds.length === 0) throw new Error("مفيش طلاب في المجموعة.");

  const entries = studentIds.map((studentId) => {
    const status = text(formData, `status_${studentId}`);
    if (!ATTENDANCE_ORDER.includes(status)) throw new Error("حالة الحضور مش مظبوطة.");
    return { studentId, status, note: text(formData, `note_${studentId}`) || null };
  });

  await saveAttendance(groupId, date, entries);
  refresh();
  redirect(`/teacher/attendance/${groupId}?date=${date}&saved=1`);
}

// ───────── Payments ─────────

// Only ever redirect back to a page inside /teacher (never to an outside URL)
function returnPath(value, fallback) {
  const target = value.startsWith("/teacher/") ? value : fallback;
  const url = new URL(target, "http://localhost");
  url.searchParams.set("saved", "1");
  return url.pathname + url.search;
}

export async function recordPaymentAction(formData) {
  await requireRole("TEACHER");
  const studentId = required(text(formData, "studentId"), "الطالب");
  const month = text(formData, "month");
  const method = text(formData, "method");
  const amount = money(formData, "amount");

  if (!isValidMonth(month)) throw new Error("الشهر مش مظبوط.");
  if (!PAYMENT_METHODS.includes(method)) throw new Error("اختار طريقة الدفع.");
  if (amount === null || amount <= 0) throw new Error("اكتب مبلغ صحيح.");
  if (amount > 100000) throw new Error("المبلغ كبير قوي، راجعه.");

  await recordPayment({ studentId, month, amount, method, note: text(formData, "note") || null });
  refresh();
  redirect(returnPath(text(formData, "returnTo"), `/teacher/students/${studentId}`));
}

export async function deletePaymentAction(formData) {
  await requireRole("TEACHER");
  const paymentId = required(text(formData, "paymentId"), "الدفعة");
  const studentId = required(text(formData, "studentId"), "الطالب");

  await deletePayment(paymentId);
  refresh();
  redirect(returnPath(text(formData, "returnTo"), `/teacher/students/${studentId}`));
}

// ───────── Homework ─────────

export async function createHomeworkAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const title = required(text(formData, "title"), "عنوان الواجب");
  const dueDate = text(formData, "dueDate");
  if (!isValidDateString(dueDate)) throw new Error("تاريخ التسليم مش مظبوط.");

  const created = await createHomework({
    groupId,
    title,
    description: text(formData, "description") || null,
    dueDate,
  });
  refresh();
  redirect(`/teacher/homework/${created.id}`);
}

export async function deleteHomeworkAction(formData) {
  await requireRole("TEACHER");
  const homeworkId = required(text(formData, "homeworkId"), "الواجب");

  await deleteHomework(homeworkId);
  refresh();
  redirect("/teacher/homework");
}

export async function saveHomeworkAction(formData) {
  await requireRole("TEACHER");
  const homeworkId = required(text(formData, "homeworkId"), "الواجب");

  const studentIds = formData.getAll("studentId").filter((v) => typeof v === "string");
  if (studentIds.length === 0) throw new Error("مفيش طلاب في المجموعة.");

  const entries = studentIds.map((studentId) => {
    const status = text(formData, `status_${studentId}`);
    if (!HOMEWORK_ORDER.includes(status)) throw new Error("حالة الواجب مش مظبوطة.");
    return { studentId, status, note: text(formData, `note_${studentId}`) || null };
  });

  await saveHomeworkResults(homeworkId, entries);
  refresh();
  redirect(`/teacher/homework/${homeworkId}?saved=1`);
}

// ───────── Exams ─────────

export async function createExamAction(formData) {
  await requireRole("TEACHER");
  const groupId = required(text(formData, "groupId"), "المجموعة");
  const title = required(text(formData, "title"), "اسم الاختبار");
  const date = text(formData, "date");
  if (!isValidDateString(date)) throw new Error("التاريخ مش مظبوط.");

  const maxScore = positiveNumber(formData, "maxScore", "الدرجة الكاملة");
  if (maxScore === null) throw new Error("اكتب الدرجة الكاملة.");

  const created = await createExam({ groupId, title, date, maxScore });
  refresh();
  redirect(`/teacher/exams/${created.id}`);
}

export async function deleteExamAction(formData) {
  await requireRole("TEACHER");
  const examId = required(text(formData, "examId"), "الاختبار");

  await deleteExam(examId);
  refresh();
  redirect("/teacher/exams");
}

export async function saveExamAction(formData) {
  await requireRole("TEACHER");
  const examId = required(text(formData, "examId"), "الاختبار");

  const studentIds = formData.getAll("studentId").filter((v) => typeof v === "string");
  if (studentIds.length === 0) throw new Error("مفيش طلاب في المجموعة.");

  const entries = studentIds.map((studentId) => {
    const absent = formData.get(`absent_${studentId}`) === "on";
    const raw = text(formData, `score_${studentId}`);
    const score = raw === "" ? null : Number(raw);
    if (!absent && raw !== "" && !Number.isFinite(score)) {
      throw new Error("الدرجة لازم تكون رقم.");
    }
    return { studentId, absent, score: absent ? null : score, note: text(formData, `note_${studentId}`) || null };
  });

  await saveExamResults(examId, entries);
  refresh();
  redirect(`/teacher/exams/${examId}?saved=1`);
}

export async function sendPaymentReminderAction(formData) {
  await requireRole("TEACHER");
  const studentId = required(text(formData, "studentId"), "الطالب");
  const month = text(formData, "month");
  if (!isValidMonth(month)) throw new Error("الشهر مش مظبوط.");

  await sendManualPaymentReminder(studentId, month);
  redirect(returnPath(text(formData, "returnTo"), `/teacher/students/${studentId}`));
}
