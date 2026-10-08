import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { hasNotification, logNotification } from "@/lib/data/notifications";
import { formatDate, formatMonth, formatScore } from "@/lib/labels";

// Every notify* function: checks it hasn't already sent this exact notification,
// sends the WhatsApp template, logs the attempt, and never throws - a WhatsApp
// failure (or missing credentials, or a missing phone number) must never break
// attendance, homework or grade saving.
async function notifyOnce({ studentId, type, refId, phone, template, params }) {
  if (await hasNotification(studentId, type, refId)) return;

  const result = await sendWhatsAppTemplate({ to: phone, template, params });
  await logNotification({ studentId, type, refId, status: result.status, error: result.error });
}

export function notifyAbsence({ studentId, studentPhone, studentName, groupName, date, attendanceRecordId }) {
  return notifyOnce({
    studentId,
    type: "ATTENDANCE_ABSENT",
    refId: attendanceRecordId,
    phone: studentPhone,
    template: "student_absence",
    params: [studentName, groupName, formatDate(date)],
  });
}

// force=true (manual "send reminder" button) re-sends even if already notified this month
export async function notifyPaymentReminder({ studentId, studentPhone, studentName, month, remaining, force = false }) {
  if (!force && (await hasNotification(studentId, "PAYMENT_REMINDER", month))) return;

  const result = await sendWhatsAppTemplate({
    to: studentPhone,
    template: "payment_reminder",
    params: [studentName, formatMonth(month), String(remaining)],
  });
  await logNotification({
    studentId,
    type: "PAYMENT_REMINDER",
    refId: month,
    status: result.status,
    error: result.error,
  });
}

export function notifyHomeworkAssigned({ studentId, studentPhone, studentName, homeworkTitle, dueDate, homeworkId }) {
  return notifyOnce({
    studentId,
    type: "HOMEWORK_ASSIGNED",
    refId: homeworkId,
    phone: studentPhone,
    template: "homework_assigned",
    params: [studentName, homeworkTitle, formatDate(dueDate)],
  });
}

export function notifyExamGrade({ studentId, studentPhone, studentName, examTitle, score, maxScore, examId }) {
  return notifyOnce({
    studentId,
    type: "EXAM_GRADE",
    refId: examId,
    phone: studentPhone,
    template: "exam_grade",
    params: [studentName, examTitle, formatScore(score), formatScore(maxScore)],
  });
}
