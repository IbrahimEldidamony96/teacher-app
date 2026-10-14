import { prisma } from "@/lib/prisma";
import { learningUser, learningOrigin, learningResponse, learningFailure, authorizeHomeworkFile } from "@/lib/learning-http";
import { learningAssert } from "@/lib/learning-policy";
import { removeHomeworkFile } from "@/lib/homework-files";
import { downloadHomeworkFile } from "@/lib/homework-download";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const user = await learningUser();
    const { homeworkId, attachmentId } = await params;
    await authorizeHomeworkFile(user, homeworkId, new URL(request.url).searchParams.get("student"));
    const file = await prisma.homeworkAttachment.findFirst({ where: { id: attachmentId, homeworkId } });
    return await downloadHomeworkFile(file);
  } catch (error) { return learningFailure(error); }
}

export async function DELETE(request, { params }) {
  try {
    learningOrigin(request);
    const user = await learningUser("TEACHER");
    const { homeworkId, attachmentId } = await params;
    await authorizeHomeworkFile(user, homeworkId);
    const file = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Homework" WHERE "id" = ${homeworkId} FOR UPDATE`;
      const row = await tx.homeworkAttachment.findFirst({ where: { id: attachmentId, homeworkId } });
      learningAssert(row, "الملف غير متاح.", 404);
      await tx.homeworkAttachment.delete({ where: { id: row.id } });
      return row;
    });
    await removeHomeworkFile(file.filePath);
    revalidatePath(`/teacher/homework/${homeworkId}`);
    revalidatePath("/dashboard");
    revalidatePath("/parent/homework", "layout");
    return learningResponse({ ok: true });
  } catch (error) { return learningFailure(error); }
}
