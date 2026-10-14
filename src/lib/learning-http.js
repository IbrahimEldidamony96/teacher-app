import { getCurrentUser } from "@/lib/auth";
import { LearningError, learningAssert } from "@/lib/learning-policy";
import { getParentHomework } from "@/lib/data/homework";
import { prisma } from "@/lib/prisma";
import { checkClassroomOrigin } from "@/lib/classroom-http";

export async function learningUser(role = null) {
  const user = await getCurrentUser();
  learningAssert(user, "سجّل الدخول أولاً.", 401);
  learningAssert(!role || user.role === role, "غير مسموح.", 403);
  return user;
}

export async function authorizeHomeworkFile(user, homeworkId, studentId) {
  const homework = user.role === "TEACHER"
    ? await prisma.homework.findUnique({ where: { id: homeworkId }, select: { id: true } })
    : user.role === "PARENT" && typeof studentId === "string" && studentId
      ? await getParentHomework(user.id, homeworkId, studentId) : null;
  learningAssert(homework, "الواجب غير متاح.", 404);
  return homework;
}

export function learningOrigin(request) {
  try { checkClassroomOrigin(request); }
  catch { throw new LearningError("طلب غير مسموح.", 403); }
}

export function learningResponse(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function learningFailure(error) {
  if (error instanceof LearningError) return learningResponse({ error: error.message }, error.status);
  console.error("Homework request failed", { name: error?.name, code: error?.code });
  return learningResponse({ error: "تعذر إكمال الطلب. أعد المحاولة." }, 500);
}
