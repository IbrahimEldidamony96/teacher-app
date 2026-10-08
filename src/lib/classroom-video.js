import path from "node:path";
import { ClassroomError, classroomAssert } from "@/lib/classroom-errors";

export function classroomVideoPath(file) {
  classroomAssert(typeof file === "string" && /^[a-f0-9-]{36}\.(mp4|webm)$/.test(file), "الفيديو غير متاح.", 404);
  return path.join(process.cwd(), "private-uploads", "classrooms", file);
}

export function detectClassroomVideo(bytes) {
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") return { mime: "video/mp4", extension: "mp4" };
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { mime: "video/webm", extension: "webm" };
  return null;
}

export function classroomVideoRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new ClassroomError("نطاق فيديو غير صالح.", 416);
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new ClassroomError("نطاق فيديو غير صالح.", 416);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new ClassroomError("نطاق فيديو غير صالح.", 416);
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
