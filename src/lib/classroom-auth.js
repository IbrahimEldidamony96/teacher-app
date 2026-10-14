import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inviteParticipantId, verifyClassroomInvite } from "@/lib/classroom-invites";
import { ClassroomError } from "@/lib/classroom-errors";

export async function actorFromClassroomInvite(sessionId, token) {
  const id = inviteParticipantId(token);
  if (!id) return null;
  const participant = await prisma.classroomParticipant.findFirst({
    where: { id, sessionId },
    include: { student: { select: { name: true, archivedAt: true } }, session: { select: { groupId: true, group: { select: { archivedAt: true } } } } },
  });
  if (!participant || participant.student.archivedAt || participant.session.group.archivedAt || !verifyClassroomInvite(participant, token)) return null;
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: participant.studentId, groupId: participant.session.groupId, endedAt: null },
    select: { id: true },
  });
  if (!enrollment) return null;
  return {
    role: "STUDENT", sessionId, participantId: participant.id,
    studentId: participant.studentId, name: participant.student.name,
  };
}

export async function getClassroomActor(sessionId) {
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") {
    const session = await prisma.classroomSession.findFirst({
      where: { id: sessionId, ownerId: user.id }, select: { id: true },
    });
    if (session) return { role: "TEACHER", sessionId, userId: user.id, name: user.name };
    return null; // Do not allow a teacher account to assume a student identity via an invite cookie.
  }
  if (user?.role === "STUDENT" && user.studentProfile?.id) {
    const participant = await prisma.classroomParticipant.findFirst({
      where: { sessionId, studentId: user.studentProfile.id, student: { archivedAt: null },
        session: { group: { archivedAt: null, enrollments: { some: { studentId: user.studentProfile.id, endedAt: null } } } } },
      select: { id: true },
    });
    if (participant) return { role: "STUDENT", sessionId, participantId: participant.id, studentId: user.studentProfile.id, name: user.name };
    return null; // A signed-in student must never fall back to somebody else\u0027s invite token.
  }
  // A private invitation link (including any previously sent to a parent) is
  // not authentication. Only the signed-in student associated with this row
  // can access video, messages or classroom API actions.
  return null;
}

export async function requireClassroomActor(sessionId) {
  const actor = await getClassroomActor(sessionId);
  if (!actor) throw new ClassroomError("الجلسة أو رابط الدعوة غير متاح.", 404);
  return actor;
}
