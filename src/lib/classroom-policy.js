import { classroomAssert } from "@/lib/classroom-errors";

export const CLASSROOM_PRESENCE_SECONDS = 45;
export const CLASSROOM_VIDEO_LIMIT = 100 * 1024 * 1024;
export const CLASSROOM_MESSAGE_LIMIT = 2000;
export const CLASSROOM_CONNECTION = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function classroomPeerId(actor, connectionId) {
  classroomAssert(CLASSROOM_CONNECTION.test(connectionId ?? ""), "أعد الانضمام للجلسة.");
  return `${actor.role === "TEACHER" ? "teacher" : actor.participantId}:${connectionId}`;
}

export function isClassroomOnline(lastSeenAt, now = Date.now()) {
  return Boolean(lastSeenAt && now - new Date(lastSeenAt).getTime() < CLASSROOM_PRESENCE_SECONDS * 1000);
}

export function presenceSeconds(previous, now) {
  if (!previous) return 0;
  const elapsed = (new Date(now).getTime() - new Date(previous).getTime()) / 1000;
  return elapsed >= 0 && elapsed <= CLASSROOM_PRESENCE_SECONDS ? Math.floor(elapsed) : 0;
}

export function validateClassroomSignal(payload) {
  classroomAssert(payload && typeof payload === "object" && !Array.isArray(payload), "بيانات اتصال غير صالحة.");
  if (payload.description) {
    const { type, sdp } = payload.description;
    classroomAssert(["offer", "answer"].includes(type) && typeof sdp === "string" && sdp.length <= 65536, "بيانات اتصال غير صالحة.");
    return { description: { type, sdp } };
  }
  const candidate = payload.candidate;
  classroomAssert(candidate && typeof candidate.candidate === "string" && candidate.candidate.length <= 2048, "بيانات اتصال غير صالحة.");
  classroomAssert(candidate.sdpMid == null || (typeof candidate.sdpMid === "string" && candidate.sdpMid.length <= 100), "بيانات اتصال غير صالحة.");
  classroomAssert(candidate.sdpMLineIndex == null || (Number.isInteger(candidate.sdpMLineIndex) && candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 30), "بيانات اتصال غير صالحة.");
  return { candidate: {
    candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    ...(typeof candidate.usernameFragment === "string" && { usernameFragment: candidate.usernameFragment.slice(0, 256) }),
  } };
}

export function summarizeHeadcounts(counts) {
  const samples = counts.filter((count) => Number.isInteger(count) && count >= 0 && count <= 300);
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return { peak: sorted.at(-1), typical: sorted[Math.floor(sorted.length / 2)], samples: samples.length };
}
