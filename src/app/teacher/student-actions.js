"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { updateStudent, setStudentLoginEmail } from "@/lib/data/students";
import { setStudentArchived, setGroupArchived, bulkEnrollStudents } from "@/lib/data/roster-lifecycle";
import { previewStudentImport, importStudents } from "@/lib/data/student-import";
import { validateStudentInput } from "@/lib/student-validation";
import { STUDENT_CSV_LIMIT } from "@/lib/student-csv";

function text(formData, key) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function refresh() { revalidatePath("/teacher", "layout"); revalidatePath("/dashboard"); }
function failure(error) {
  const known = ["STUDENT_INPUT", "STUDENT_MISSING", "GROUP_MISSING", "GROUP_ARCHIVED", "STUDENT_ARCHIVED", "RECORD_MISSING"];
  return { message: known.includes(error?.code) ? error.message : "تعذّر حفظ التغيير. حدّث الصفحة وحاول تاني.", success: false };
}

export async function updateStudentAction(_previous, formData) {
  await requireRole("TEACHER");
  const studentId = text(formData, "studentId");
  if (!studentId) return { message: "الطالب مطلوب.", success: false };
  const { data, errors } = validateStudentInput(Object.fromEntries(["name", "gradeLevel", "studentPhone", "notes"].map((key) => [key, text(formData, key)])));
  if (errors.length) return { message: errors.join(" "), success: false };
  let result;
  try { result = await updateStudent(studentId, data); }
  catch (error) { return failure(error); }
  if (!result.updated) return { message: "فيه طالب تاني بنفس الاسم ورقم الطالب.", existingStudentId: result.existingStudentId, success: false };
  refresh();
  return { message: "اتحفظت بيانات الطالب.", success: true };
}

export async function studentLifecycleAction(_previous, formData) {
  await requireRole("TEACHER");
  const id = text(formData, "recordId"), intent = text(formData, "intent");
  if (!id || !["archive", "restore"].includes(intent)) return { message: "اختار طالب وتغيير صحيح.", success: false };
  try { await setStudentArchived(id, intent === "archive"); }
  catch (error) { return failure(error); }
  refresh();
  return { message: intent === "archive" ? "اتأرشف الطالب مع الاحتفاظ بكل السجل." : "اترجع الطالب. ممكن تضيفه لمجموعة من جديد.", success: true };
}

export async function groupLifecycleAction(_previous, formData) {
  await requireRole("TEACHER");
  const id = text(formData, "recordId"), intent = text(formData, "intent");
  if (!id || !["archive", "restore"].includes(intent)) return { message: "اختار مجموعة وتغيير صحيح.", success: false };
  try { await setGroupArchived(id, intent === "archive"); }
  catch (error) { return failure(error); }
  refresh();
  return { message: intent === "archive" ? "اتأرشفت المجموعة مع الاحتفاظ بكل السجل." : "اترجعت المجموعة. ضيف الطلاب المطلوبين من جديد.", success: true };
}

export async function bulkEnrollStudentsAction(_previous, formData) {
  await requireRole("TEACHER");
  const groupId = text(formData, "groupId");
  const studentIds = formData.getAll("studentId");
  const rawFee = text(formData, "monthlyFee");
  const monthlyFee = rawFee === "" ? null : Number(rawFee);
  if (!groupId || studentIds.some((id) => typeof id !== "string" || !id) || (monthlyFee !== null && (!Number.isInteger(monthlyFee) || monthlyFee < 0 || monthlyFee > 100000))) {
    return { message: "اختار مجموعة واكتب اشتراك صحيح لو محتاج اشتراك خاص.", success: false };
  }
  let result;
  try { result = await bulkEnrollStudents(groupId, studentIds, monthlyFee); }
  catch (error) { return failure(error); }
  refresh();
  return { message: `اتضاف ${result.enrolled} طالب. ${result.skipped} مسجلين في المجموعة بالفعل.`, success: true };
}

export async function importStudentsAction(_previous, formData) {
  await requireRole("TEACHER");
  const intent = text(formData, "intent");
  if (!["preview", "import"].includes(intent)) return { message: "اعرض المعاينة الأول.", success: false };
  let source = typeof formData.get("source") === "string" ? formData.get("source") : "";
  const file = formData.get("file");
  if (file && typeof file !== "string" && file.size) {
    if (file.size > STUDENT_CSV_LIMIT) return { message: "ملف CSV لازم يكون أقل من 200 كيلوبايت.", success: false };
    source = await file.text();
  }
  if (Buffer.byteLength(source, "utf8") > STUDENT_CSV_LIMIT) return { message: "ملف CSV لازم يكون أقل من 200 كيلوبايت.", success: false };
  let rows;
  try { rows = await previewStudentImport(source); }
  catch (error) { return failure(error); }
  const groupId = text(formData, "groupId");
  if (intent === "preview") return { message: "راجع البيانات قبل الاستيراد. الطلاب المسجلين بالفعل هيتم تخطيهم.", rows, source, groupId, preview: true, success: true };
  if (rows.some((row) => row.errors.length)) return { message: "صحّح الصفوف اللي فيها أخطاء وأعد المعاينة.", rows, source, groupId, preview: true, success: false };
  let result;
  try { result = await importStudents(source, groupId || null); }
  catch (error) { return failure(error); }
  refresh();
  return { message: `اتضاف ${result.created} طالب واتخطّى ${result.skipped} طالب مسجل بالفعل.`, success: true, completed: true };
}

export async function setStudentLoginEmailAction(_previous, formData) {
  await requireRole("TEACHER");
  const studentId = text(formData, "studentId");
  if (!studentId) return { message: "الطالب مطلوب.", success: false };
  try {
    await setStudentLoginEmail(studentId, text(formData, "loginEmail"));
    refresh();
    return { message: "اتحفظ البريد الإلكتروني للطالب.", success: true };
  } catch (error) {
    if (error?.code === "P2002") return { message: "الإيميل ده مستخدم لطالب تاني بالفعل.", success: false };
    if (error?.message === "اكتب بريد إلكتروني صحيح للطالب." || error?.message === "البريد الإلكتروني مخصص لحساب المدرس.") {
      return { message: error.message, success: false };
    }
    return { message: "تعذّر حفظ الحساب. راجع البيانات وحاول تاني.", success: false };
  }
}
