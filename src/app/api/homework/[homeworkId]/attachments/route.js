import { prisma } from "@/lib/prisma";
import { learningUser, learningOrigin, learningResponse, learningFailure, authorizeHomeworkFile } from "@/lib/learning-http";
import { learningAssert, HOMEWORK_FILE_TYPES } from "@/lib/learning-policy";
import { readLimitedHomeworkBody, storeHomeworkFile, removeHomeworkFile } from "@/lib/homework-files";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  let file;
  let attached = false;
  try {
    learningOrigin(request);
    const user = await learningUser("TEACHER");
    const { homeworkId } = await params;
    await authorizeHomeworkFile(user, homeworkId);
    const mime = request.headers.get("content-type")?.split(";")[0];
    learningAssert(HOMEWORK_FILE_TYPES.includes(mime), "اختار PDF أو صورة JPG أو PNG أو WebP.", 415);
    let name;
    try { name = decodeURIComponent(request.headers.get("x-file-name") || "homework"); }
    catch { name = "homework"; }
    file = await storeHomeworkFile(await readLimitedHomeworkBody(request), name, mime);
    const attachment = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT "id" FROM "Homework" WHERE "id" = ${homeworkId} FOR UPDATE`;
      learningAssert(rows.length > 0, "الواجب غير متاح.", 404);
      learningAssert(await tx.homeworkAttachment.count({ where: { homeworkId } }) < 10, "الواجب يسمح بعشرة ملفات كحد أقصى.");
      return tx.homeworkAttachment.create({
        data: { homeworkId, filePath: file.path, fileName: file.name, fileMime: file.mime, fileSize: file.size },
        select: { id: true },
      });
    });
    attached = true;
    revalidatePath(`/teacher/homework/${homeworkId}`);
    revalidatePath("/dashboard");
    revalidatePath("/student/homework", "layout");
    return learningResponse({ ok: true, id: attachment.id }, 201);
  } catch (error) { return learningFailure(error); }
  finally { if (file && !attached) await removeHomeworkFile(file.path); }
}
