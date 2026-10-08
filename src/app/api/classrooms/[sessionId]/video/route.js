import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireClassroomActor } from "@/lib/classroom-auth";
import { attachClassroomVideo, classroomVideo } from "@/lib/data/classrooms";
import { ClassroomError, classroomAssert } from "@/lib/classroom-errors";
import { CLASSROOM_VIDEO_LIMIT } from "@/lib/classroom-policy";
import { classroomVideoPath, classroomVideoRange, detectClassroomVideo } from "@/lib/classroom-video";
import { checkClassroomOrigin, classroomFailure, classroomResponse } from "@/lib/classroom-http";

export const runtime = "nodejs";

async function serveVideo(request, params, head = false) {
  let size;
  try {
    const { sessionId } = await params;
    const actor = await requireClassroomActor(sessionId);
    const video = await classroomVideo(actor);
    classroomAssert(video.file, "الفيديو لم يرفع بعد.", 404);
    const filename = classroomVideoPath(video.file);
    let info;
    try { info = await stat(filename); }
    catch { throw new ClassroomError("الفيديو غير متاح حالياً.", 404); }
    size = info.size;
    const range = classroomVideoRange(request.headers.get("range"), size);
    const headers = {
      "Content-Type": video.mime, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(video.name ?? "lesson")}`,
      "Content-Length": String(range ? range.end - range.start + 1 : size),
      ...(range && { "Content-Range": `bytes ${range.start}-${range.end}/${size}` }),
    };
    return new Response(head ? null : Readable.toWeb(createReadStream(filename, range ?? {})), { status: range ? 206 : 200, headers });
  } catch (error) {
    if (error instanceof ClassroomError && error.status === 416 && size != null) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" } });
    }
    return classroomFailure(error);
  }
}

export function GET(request, { params }) { return serveVideo(request, params); }
export function HEAD(request, { params }) { return serveVideo(request, params, true); }

export async function PUT(request, { params }) {
  let filename;
  let attached = false;
  try {
    checkClassroomOrigin(request);
    const { sessionId } = await params;
    const actor = await requireClassroomActor(sessionId);
    classroomAssert(actor.role === "TEACHER", "غير مسموح.", 403);
    classroomAssert(request.body, "اختار فيديو للرفع.");
    const type = request.headers.get("content-type")?.split(";")[0];
    classroomAssert(["video/mp4", "video/webm"].includes(type), "اختار فيديو MP4 أو WebM.", 415);
    const claimedSize = Number(request.headers.get("content-length"));
    classroomAssert(!claimedSize || claimedSize <= CLASSROOM_VIDEO_LIMIT, "حجم الفيديو أكبر من ١٠٠ ميجابايت.", 413);
    const extension = type === "video/mp4" ? "mp4" : "webm";
    const file = `${randomUUID()}.${extension}`;
    filename = classroomVideoPath(file);
    await mkdir(path.dirname(filename), { recursive: true });
    let size = 0;
    let first = Buffer.alloc(0);
    let verified = false;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        size += chunk.length;
        if (size > CLASSROOM_VIDEO_LIMIT) return callback(new ClassroomError("حجم الفيديو أكبر من ١٠٠ ميجابايت.", 413));
        if (!verified) {
          first = Buffer.concat([first, chunk.subarray(0, Math.max(0, 32 - first.length))]);
          if (first.length >= 12) {
            const detected = detectClassroomVideo(first);
            if (detected?.mime !== type) return callback(new ClassroomError("الملف ليس فيديو MP4 أو WebM صالح.", 415));
            verified = true;
          }
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(request.body), limiter, createWriteStream(filename, { flags: "wx" }));
    classroomAssert(verified && size > 0, "ملف الفيديو غير صالح.", 415);
    let name;
    try { name = decodeURIComponent(request.headers.get("x-video-name") ?? "lesson"); }
    catch { name = "lesson"; }
    name = name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180);
    await attachClassroomVideo(actor, { file, name, mime: type, size });
    attached = true;
    return classroomResponse({ ok: true }, 201);
  } catch (error) {
    return classroomFailure(error);
  } finally {
    if (filename && !attached) await unlink(filename).catch(() => {});
  }
}
