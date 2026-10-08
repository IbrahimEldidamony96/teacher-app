import { ClassroomError, classroomAssert } from "@/lib/classroom-errors";
import { classroomInvitationOrigin } from "@/lib/classroom-origin";

export function checkClassroomOrigin(request) {
  const origin = request.headers.get("origin");
  classroomAssert(!origin || origin === new URL(request.url).origin
    || (process.env.CLASSROOM_PUBLIC_URL?.trim() && origin === classroomInvitationOrigin()), "طلب غير مسموح.", 403);
  classroomAssert(request.headers.get("sec-fetch-site") !== "cross-site", "طلب غير مسموح.", 403);
}

export async function classroomJson(request) {
  classroomAssert(request.headers.get("content-type")?.split(";")[0] === "application/json", "صيغة طلب غير صالحة.", 415);
  const reader = request.body?.getReader();
  classroomAssert(reader, "طلب فارغ.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new ClassroomError("الطلب كبير جداً.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    classroomAssert(body && typeof body === "object" && !Array.isArray(body), "طلب غير صالح.");
    return body;
  } catch (error) {
    if (error instanceof ClassroomError) throw error;
    throw new ClassroomError("طلب غير صالح.");
  }
}

export function classroomResponse(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function classroomFailure(error) {
  if (error instanceof ClassroomError) return classroomResponse({ error: error.message }, error.status);
  // Error details may contain invitation tokens, paths or personal data.
  const cause = error?.meta?.driverAdapterError?.cause;
  const databaseCode = cause?.originalCode ?? cause?.code;
  console.error("Classroom request failed", {
    name: error?.name, code: error?.code,
    ...(typeof databaseCode === "string" && /^[A-Z0-9]{5}$/.test(databaseCode) && { databaseCode }),
  });
  return classroomResponse({ error: "تعذر إكمال الطلب. أعد المحاولة." }, 500);
}
