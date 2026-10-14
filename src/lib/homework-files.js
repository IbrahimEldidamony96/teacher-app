import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { HOMEWORK_FILE_LIMIT, learningAssert } from "@/lib/learning-policy";

// Only generated filenames can reach the filesystem; original names are display metadata.
export function homeworkFilePath(file) {
  learningAssert(typeof file === "string" && /^[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/.test(file), "الملف غير متاح.", 404);
  return path.join(process.cwd(), "private-uploads", "homework", file);
}

export function detectHomeworkFile(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return { mime: "application/pdf", extension: "pdf" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

export async function readLimitedHomeworkBody(request, limit = HOMEWORK_FILE_LIMIT) {
  const claimed = Number(request.headers.get("content-length"));
  learningAssert(!claimed || (Number.isSafeInteger(claimed) && claimed > 0 && claimed <= limit), "حجم الملف أكبر من ١٠ ميجابايت.", 413);
  const reader = request.body?.getReader();
  learningAssert(reader, "الطلب فارغ.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        learningAssert(false, "حجم الملف أكبر من ١٠ ميجابايت.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function storeHomeworkFile(bytes, name, claimedMime) {
  learningAssert(bytes.length > 0 && bytes.length <= HOMEWORK_FILE_LIMIT, "اختار ملفاً حتى ١٠ ميجابايت.", 413);
  const type = detectHomeworkFile(bytes);
  learningAssert(type && (!claimedMime || claimedMime === type.mime), "اختار ملف PDF أو صورة JPG أو PNG أو WebP صالحة.", 415);
  const filename = `${randomUUID()}.${type.extension}`;
  const target = homeworkFilePath(filename);
  const cleanName = String(name || `homework.${type.extension}`).replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180);
  await mkdir(path.dirname(target), { recursive: true });
  try { await writeFile(target, bytes, { flag: "wx" }); }
  catch (error) { await unlink(target).catch(() => {}); throw error; }
  return { path: filename, name: cleanName, mime: type.mime, size: bytes.length };
}

export async function removeHomeworkFile(filename) {
  if (!filename) return;
  await unlink(homeworkFilePath(filename)).catch((error) => {
    if (error.code !== "ENOENT") console.error("Could not remove private homework file", { code: error.code });
  });
}
