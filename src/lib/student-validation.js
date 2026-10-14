import { GRADE_ORDER, GRADE_LABELS } from "@/lib/labels";
import { normalizeParentPhone, normalizeStudentName } from "@/lib/student-identity";

export function validateStudentInput(input) {
  const name = normalizeStudentName(typeof input.name === "string" ? input.name : "");
  const rawPhone = typeof input.parentPhone === "string" ? input.parentPhone.trim() : "";
  const parentPhone = normalizeParentPhone(rawPhone);
  const grade = typeof input.gradeLevel === "string" ? input.gradeLevel.trim() : "";
  const gradeLevel = GRADE_ORDER.includes(grade) ? grade : GRADE_ORDER.find((key) => GRADE_LABELS[key] === grade);
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const errors = [];
  if (!name || name.length > 150) errors.push("اسم الطالب مطلوب وبحد أقصى 150 حرف.");
  if (!gradeLevel) errors.push("اختار صف دراسي صحيح.");
  if (rawPhone && !/^\d{8,15}$/.test(parentPhone ?? "")) errors.push("رقم ولي الأمر مش مظبوط.");
  if (notes.length > 2000) errors.push("الملاحظات بحد أقصى 2000 حرف.");
  return { data: { name, gradeLevel, parentPhone, notes: notes || null }, errors };
}

export function studentIdentity({ name, parentPhone }) {
  const phone = normalizeParentPhone(parentPhone);
  return phone ? JSON.stringify([normalizeStudentName(name).toLowerCase(), phone]) : null;
}

export function studentError(message, code = "STUDENT_INPUT") {
  return Object.assign(new Error(message), { code });
}
