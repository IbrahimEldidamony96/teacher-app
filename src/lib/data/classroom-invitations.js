import { prisma } from "@/lib/prisma";
import { createClassroomInvite } from "@/lib/classroom-invites";
import { classroomInvitationOrigin } from "@/lib/classroom-origin";
import { classroomAssert } from "@/lib/classroom-errors";
import { CLASSROOM_CONNECTION, isClassroomOnline } from "@/lib/classroom-policy";
import { classroomInvitationTemplateStatus, isWhatsAppConfigured, sendWhatsAppTemplate, whatsAppFailureDiagnostics, whatsAppFailureMessage } from "@/lib/whatsapp";
import { changeClassroom, getClassroomState } from "@/lib/data/classrooms";

export { classroomInvitationOrigin } from "@/lib/classroom-origin";

const failureMessage = "تعذر إرسال الدعوة لهذا الطالب. أعد المحاولة.";
const notificationType = "CLASSROOM_INVITATION";

async function requireLiveTeacher(actor, connectionId, db = prisma) {
  classroomAssert(actor?.role === "TEACHER" && actor.userId && actor.sessionId, "غير مسموح.", 403);
  classroomAssert(CLASSROOM_CONNECTION.test(connectionId ?? ""), "أعد الانضمام للجلسة قبل إرسال الدعوات.", 409);
  const session = await db.classroomSession.findUnique({
    where: { id: actor.sessionId }, include: { group: { select: { name: true } } },
  });
  classroomAssert(session, "الجلسة غير متاحة.", 404);
  classroomAssert(session.ownerId === actor.userId, "غير مسموح.", 403);
  classroomAssert(session.mode === "LIVE" && session.status === "ACTIVE", "ابدأ البث المباشر قبل إرسال الدعوات.", 409);
  classroomAssert(session.teacherConnectionId === connectionId && isClassroomOnline(session.teacherLastSeenAt),
    "البث غير متصل في هذا التبويب. أعد الانضمام قبل إرسال الدعوات.", 409);
  return session;
}

export async function prepareClassroomInvitations(actor, { connectionId, requestOrigin }) {
  await requireLiveTeacher(actor, connectionId);
  classroomInvitationOrigin(requestOrigin);
  classroomAssert(isWhatsAppConfigured(), "إرسال الدعوات يحتاج إعداد WhatsApp وقالب classroom_invitation المعتمد.", 409);
  const templateStatus = await classroomInvitationTemplateStatus();
  classroomAssert(templateStatus !== "INVALID_ACCESS_TOKEN", whatsAppFailureMessage({ providerCode: 190 }), 409);
  classroomAssert(!["PENDING", "IN_APPEAL"].includes(templateStatus),
    "قالب دعوة الحصة في انتظار موافقة Meta. أعد المحاولة بعد اعتماد القالب في WhatsApp Manager.", 409);
  classroomAssert(templateStatus !== "REJECTED", "رفضت Meta قالب دعوة الحصة. راجع القالب في WhatsApp Manager قبل إعادة الإرسال.", 409);
  classroomAssert(templateStatus !== "PAUSED", whatsAppFailureMessage({ providerCode: 132015 }), 409);
  classroomAssert(templateStatus !== "DISABLED", whatsAppFailureMessage({ providerCode: 132016 }), 409);
  classroomAssert(!["MISSING", "DELETED", "PENDING_DELETION", "LIMIT_EXCEEDED"].includes(templateStatus), whatsAppFailureMessage({ providerCode: 132001 }), 409);
  await changeClassroom(actor, { action: "refreshRoster" });
  await requireLiveTeacher(actor, connectionId);
  return getClassroomState(actor, { connectionId });
}

async function sendStudentInvitation(actor, connectionId, origin, original) {
  try {
    return await prisma.$transaction(async (tx) => {
      // This invitation's lock prevents duplicate concurrent sends. The
      // transaction holds a database connection while WhatsApp responds.
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      const refId = `${original.id}:${original.inviteNonce}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`classroom-invitation:${refId}`}, 0))`;
      const session = await requireLiveTeacher(actor, connectionId, tx);
      const participant = await tx.classroomParticipant.findFirst({
        where: {
          id: original.id, sessionId: session.id, inviteNonce: original.inviteNonce,
          student: { enrollments: { some: { groupId: session.groupId } } },
        },
        include: { student: { select: { name: true, parentPhone: true } } },
      });
      classroomAssert(participant, "دعوة الطالب أو تسجيله بالمجموعة تغير. حدث القائمة وأعد المحاولة.", 409);
      const sent = await tx.notification.findFirst({
        where: { studentId: participant.studentId, type: notificationType, refId, status: "sent" },
        select: { id: true },
      });
      if (sent) return { studentId: participant.studentId, status: "already_sent" };
      const inviteUrl = new URL(`/api/classrooms/${session.id}/invite`, origin);
      inviteUrl.searchParams.set("token", createClassroomInvite(participant));
      const response = await sendWhatsAppTemplate({
        to: participant.student.parentPhone, template: "classroom_invitation",
        params: [participant.student.name, session.group.name, session.title, inviteUrl.href],
      });
      const status = ["sent", "skipped_no_phone", "skipped_not_configured"].includes(response.status)
        ? response.status : "failed";
      // Provider messages may contain private links or phones. Use fixed
      // explanations and log only validated numeric provider diagnostics.
      const error = status === "failed" ? whatsAppFailureMessage(response) : null;
      if (status === "failed") console.warn("Classroom WhatsApp invitation failed", whatsAppFailureDiagnostics(response));
      await tx.notification.create({
        data: { studentId: participant.studentId, type: notificationType, refId, status, error },
      });
      return { studentId: participant.studentId, status, ...(error && { error }) };
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch {
    return { studentId: original.studentId, status: "failed", error: failureMessage };
  }
}

export async function sendClassroomInvitations(actor, { studentIds, connectionId, requestOrigin }) {
  const session = await requireLiveTeacher(actor, connectionId);
  const origin = classroomInvitationOrigin(requestOrigin);
  classroomAssert(Array.isArray(studentIds) && studentIds.length > 0 && studentIds.length <= 5
    && studentIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 100)
    && new Set(studentIds).size === studentIds.length, "اختار من طالب واحد إلى خمسة طلاب مختلفين في كل دفعة.");
  const participants = await prisma.classroomParticipant.findMany({
    where: {
      sessionId: session.id, studentId: { in: studentIds },
      student: { enrollments: { some: { groupId: session.groupId } } },
    },
  });
  classroomAssert(participants.length === studentIds.length, "بعض الطلاب غير مسجلين في هذه الجلسة. حدث قائمة الطلاب.", 403);
  const byStudent = new Map(participants.map((participant) => [participant.studentId, participant]));
  const results = await Promise.all(studentIds.map((studentId) => sendStudentInvitation(actor, connectionId, origin, byStudent.get(studentId))));
  return { results };
}
