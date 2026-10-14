import { getHomeworkForStudent, submitStudentHomework } from "@/lib/data/homework";
import { learningUser, learningOrigin, learningResponse, learningFailure } from "@/lib/learning-http";
import { HOMEWORK_FILE_LIMIT, learningAssert } from "@/lib/learning-policy";
import { readLimitedHomeworkBody, storeHomeworkFile, removeHomeworkFile } from "@/lib/homework-files";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  let file;
  let saved = false;
  try {
    learningOrigin(request);
    const user = await learningUser("STUDENT");
    const { homeworkId } = await params;
    const studentId = user.studentProfile.id;
    learningAssert(studentId && await getHomeworkForStudent(studentId, homeworkId), "الواجب غير متاح لهذا الطالب.", 404);
    const type = request.headers.get("content-type") || "";
    learningAssert(type.startsWith("multipart/form-data;"), "صيغة الطلب غير صالحة.", 415);
    // Bound the full multipart request before its parser can allocate memory for uploads.
    const bytes = await readLimitedHomeworkBody(request, HOMEWORK_FILE_LIMIT + 64 * 1024);
    let form;
    try { form = await new Request("http://localhost", { method: "POST", headers: { "Content-Type": type }, body: bytes }).formData(); }
    catch { learningAssert(false, "صيغة الطلب غير صالحة."); }
    const body = form.get("body");
    learningAssert(typeof body === "string", "اكتب إجابة أو ارفع ملفاً.");
    const upload = form.get("file");
    if (upload && typeof upload === "object" && upload.size > 0) {
      learningAssert(upload.size <= HOMEWORK_FILE_LIMIT, "حجم الملف أكبر من ١٠ ميجابايت.", 413);
      file = await storeHomeworkFile(Buffer.from(await upload.arrayBuffer()), upload.name, upload.type);
    }
    await submitStudentHomework(user, homeworkId, { body, file, removeFile: form.get("removeFile") === "on" });
    saved = true;
    revalidatePath(`/teacher/homework/${homeworkId}`);
    revalidatePath(`/student/homework/${homeworkId}`);
    revalidatePath("/dashboard");
    return learningResponse({ ok: true });
  } catch (error) { return learningFailure(error); }
  finally { if (file && !saved) await removeHomeworkFile(file.path); }
}
