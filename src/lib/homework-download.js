import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { homeworkFilePath } from "@/lib/homework-files";
import { LearningError, learningAssert } from "@/lib/learning-policy";

export async function downloadHomeworkFile(file) {
  learningAssert(file?.filePath, "الملف غير متاح.", 404);
  const filename = homeworkFilePath(file.filePath);
  let info;
  try { info = await stat(filename); }
  catch { throw new LearningError("الملف غير متاح حالياً.", 404); }
  learningAssert(info.isFile(), "الملف غير متاح.", 404);
  return new Response(Readable.toWeb(createReadStream(filename)), {
    headers: {
      "Content-Type": file.fileMime,
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
