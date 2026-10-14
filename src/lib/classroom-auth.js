import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classroomCookieName, inviteParticipantId, verifyClassroomInvite } from "@/lib/classroom-invites";
import { ClassroomError } from "@/lib/classroom-errors";

export async function actorFromClassroomInvite(sessionId, token) {
  const id = inviteParticipantId(token);
  if (!id) return null;
  const participant = await prisma.classroomParticipant.findFirst({
    where: { id, sessionId },
    include: { student: { select: { name: true } }, session: { select: { groupId: true } } },
  });
  if (!participant || !verifyClassroomInvite(participant, token)) return null;
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_groupId: { studentId: participant.studentId, groupId: participant.session.groupId } },
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
  }
  if (user?.role === "STUDENT" && user.studentProfile?.id) {
    const participant = await prisma.classroomParticipant.findFirst({
      where: { sessionId, studentId: user.studentProfile.id, student: { archivedAt: null },
        session: { group: { archivedAt: null, enrollments: { some: { studentId: user.studentProfile.id, endedAt: null } } } } },
      select: { id: true },
    });
    if (participant) return { role: "STUDENT", sessionId, participantId: participant.id, studentId: user.studentProfile.id, name: user.name };
  }
  const token = (await cookies()).get(classroomCookieName(sessionId))?.value;
  return actorFromClassroomInvite(sessionId, token);
}

export async function requireClassroomActor(sessionId) {
  const actor = await getClassroomActor(sessionId);
  if (!actor) throw new ClassroomError("الجلسة أو رابط الدعوة غير متاح.", 404);
  return actor;
}
