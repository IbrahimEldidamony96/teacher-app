import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cairoToday, isValidDateString, toDbDate } from "@/lib/time";
import { saveAttendance } from "@/lib/data/attendance";
import { createClassroomInvite } from "@/lib/classroom-invites";
import { classroomInvitationOrigin } from "@/lib/classroom-origin";
import { classroomAssert } from "@/lib/classroom-errors";
import {
  CLASSROOM_CONNECTION, CLASSROOM_MESSAGE_LIMIT, classroomPeerId,
  isClassroomOnline, presenceSeconds, validateClassroomSignal,
} from "@/lib/classroom-policy";

const statuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

function teacherOnly(actor, session) {
  classroomAssert(actor?.role === "TEACHER" && actor.userId === session.ownerId, "غير مسموح.", 403);
}

async function loadSession(actor, db = prisma) {
  classroomAssert(actor?.sessionId, "الجلسة غير متاحة.", 404);
  const session = await db.classroomSession.findUnique({
    where: { id: actor.sessionId },
    include: {
      group: { select: { name: true } },
      owner: { select: { name: true } },
      participants: {
        include: { student: { select: {
          name: true, enrollments: { select: { groupId: true } },
        } } },
        orderBy: [{ student: { name: "asc" } }, { id: "asc" }],
      },
    },
  });
  classroomAssert(session, "الجلسة غير متاحة.", 404);
  if (actor.role === "TEACHER") teacherOnly(actor, session);
  else {
    const participant = session.participants.find((row) => row.id === actor.participantId);
    classroomAssert(actor.role === "STUDENT" && participant && participant.studentId === actor.studentId && isEnrolled(participant, session), "رابط الدعوة غير متاح.", 403);
  }
  return session;
}

function isEnrolled(participant, session) {
  return participant.student.enrollments.some((row) => row.groupId === session.groupId);
}

function visibleMessage(actor, message) {
  return actor.role === "TEACHER" || !message.isPrivate || message.senderId === actor.participantId || message.recipientId === actor.participantId;
}

function currentConnection(actor, session) {
  return actor.role === "TEACHER"
    ? session.teacherConnectionId
    : session.participants.find((row) => row.id === actor.participantId)?.connectionId;
}

export async function createClassroom(user, input) {
  classroomAssert(user?.role === "TEACHER", "غير مسموح.", 403);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  classroomAssert(title && title.length <= 160, "اكتب عنوان الجلسة (حتى ١٦٠ حرف).");
  classroomAssert(["LIVE", "RECORDING"].includes(input.mode), "اختار نوع الجلسة.");
  classroomAssert(isValidDateString(input.date ?? "") && input.date <= cairoToday(), "اختار تاريخ اليوم أو تاريخ سابق.");
  const group = await prisma.studyGroup.findUnique({
    where: { id: typeof input.groupId === "string" ? input.groupId : "" },
    select: { id: true, enrollments: { select: { studentId: true } } },
  });
  classroomAssert(group, "المجموعة غير موجودة.", 404);
  classroomAssert(group.enrollments.length > 0, "ضيف طلاب للمجموعة قبل إنشاء الجلسة.");
  classroomAssert(group.enrollments.length <= 200, "الجلسة تدعم حتى ٢٠٠ طالب في القائمة.");
  return prisma.classroomSession.create({
    data: {
      ownerId: user.id, groupId: group.id, title, mode: input.mode,
      attendanceDate: toDbDate(input.date),
      participants: { create: group.enrollments.map(({ studentId }) => ({ studentId })) },
    },
    select: { id: true },
  });
}

export function listClassrooms(user) {
  classroomAssert(user?.role === "TEACHER", "غير مسموح.", 403);
  return prisma.classroomSession.findMany({
    where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, title: true, mode: true, status: true, attendanceDate: true, group: { select: { name: true } }, _count: { select: { participants: true } } },
  });
}

export async function getClassroomState(actor, { messageAfter = 0, messageBefore = 0, signalAfter = 0, connectionId } = {}) {
  classroomAssert(Number.isSafeInteger(messageAfter) && messageAfter >= 0 && Number.isSafeInteger(messageBefore) && messageBefore >= 0 && !(messageBefore && messageAfter) && Number.isSafeInteger(signalAfter) && signalAfter >= 0, "طلب غير صالح.");
  const session = await loadSession(actor);
  const roster = session.participants.filter((row) => isEnrolled(row, session));
  const participant = actor.role === "STUDENT" ? roster.find((row) => row.id === actor.participantId) : null;
  const connectionCurrent = Boolean(connectionId && currentConnection(actor, session) === connectionId);
  const peerId = connectionCurrent ? classroomPeerId(actor, connectionId) : null;
  const [messages, signals, attendance] = await Promise.all([
    prisma.classroomMessage.findMany({
      where: {
        sessionId: session.id, id: { gt: messageAfter, ...(messageBefore && { lt: messageBefore }) },
        ...(actor.role !== "TEACHER" && { OR: [{ isPrivate: false }, { senderId: actor.participantId }, { recipientId: actor.participantId }] }),
      },
      orderBy: { id: messageAfter ? "asc" : "desc" }, take: 100,
      include: { sender: { select: { student: { select: { name: true } } } }, recipient: { select: { student: { select: { name: true } } } } },
    }),
    peerId && session.status === "ACTIVE" ? prisma.classroomSignal.findMany({
      where: { sessionId: session.id, toPeer: peerId, id: { gt: signalAfter }, createdAt: { gte: new Date(Date.now() - 120_000) } },
      orderBy: { id: "asc" }, take: 200,
      select: { id: true, fromPeer: true, payload: true },
    }) : [],
    actor.role === "TEACHER" ? prisma.attendanceRecord.findMany({
      where: { groupId: session.groupId, date: session.attendanceDate },
      select: { studentId: true, status: true, note: true },
    }) : [],
  ]);
  if (!messageAfter) messages.reverse();
  const teacherOnline = isClassroomOnline(session.teacherLastSeenAt);
  const invitationOrigin = actor.role === "TEACHER" && process.env.CLASSROOM_PUBLIC_URL?.trim() ? classroomInvitationOrigin() : "";
  const peers = actor.role === "TEACHER"
    ? roster.filter((row) => row.connectionId && isClassroomOnline(row.lastSeenAt)).map((row) => ({ id: `${row.id}:${row.connectionId}`, name: row.student.name }))
    : teacherOnline && session.teacherConnectionId ? [{ id: `teacher:${session.teacherConnectionId}`, name: session.owner.name }] : [];

  return {
    session: {
      id: session.id, title: session.title, groupName: session.group.name,
      mode: session.mode, status: session.status, date: session.attendanceDate.toISOString().slice(0, 10),
      videoUrl: session.videoFile ? `/api/classrooms/${session.id}/video` : null,
      videoName: session.videoName, headcountEstimate: session.headcountEstimate,
      headcountSamples: session.headcountSamples, attendanceConfirmedAt: session.attendanceConfirmedAt,
      teacherOnline, teacherName: session.owner.name,
    },
    actor: { role: actor.role, name: actor.name, participantId: actor.participantId ?? null },
    connectionCurrent, peers, signals,
    messages: messages.map((row) => ({
      id: row.id, body: row.body, kind: row.kind, isPrivate: row.isPrivate, replyToId: row.replyToId,
      senderId: row.senderId, senderName: row.sender?.student.name ?? session.owner.name,
      recipientId: row.recipientId, recipientName: row.recipient?.student.name ?? null, createdAt: row.createdAt,
    })),
    ...(actor.role === "TEACHER" && {
      roster: roster.map((row) => ({
        id: row.id, studentId: row.studentId, name: row.student.name, joinedAt: row.joinedAt,
        online: isClassroomOnline(row.lastSeenAt), attendedSeconds: row.attendedSeconds, handRaised: row.handRaised,
        recordedStatus: attendance.find((record) => record.studentId === row.studentId)?.status ?? null,
        recordedNote: attendance.find((record) => record.studentId === row.studentId)?.note ?? "",
        invitePath: `${invitationOrigin}/api/classrooms/${session.id}/invite?token=${createClassroomInvite(row)}`,
      })),
    }),
    ...(participant && { self: { handRaised: participant.handRaised, joinedAt: participant.joinedAt, attendedSeconds: participant.attendedSeconds } }),
  };
}

export async function changeClassroom(actor, input) {
  classroomAssert(input && typeof input === "object" && !Array.isArray(input), "طلب غير صالح.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`classroom:${actor.sessionId}`}, 0))`;
    const session = await loadSession(actor, tx);
    const now = new Date();
    const own = session.participants.find((row) => row.id === actor.participantId);
    const teacherActions = ["start", "end", "estimate", "rotateInvite", "refreshRoster"];
    if (teacherActions.includes(input.action)) teacherOnly(actor, session);

    if (input.action === "start") {
      classroomAssert(session.status !== "ENDED", "الجلسة انتهت.", 409);
      classroomAssert(session.mode === "LIVE" || session.videoFile, "ارفع الفيديو أولاً.");
      await tx.classroomSession.update({ where: { id: session.id }, data: { status: "ACTIVE", startedAt: session.startedAt ?? now } });
      return { ok: true };
    }
    if (input.action === "end") {
      await tx.classroomSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: session.endedAt ?? now, teacherLastSeenAt: null } });
      await tx.classroomSignal.deleteMany({ where: { sessionId: session.id } });
      return { ok: true };
    }
    if (input.action === "rotateInvite") {
      const target = session.participants.find((row) => row.id === input.participantId);
      classroomAssert(target, "الطالب غير موجود في الجلسة.");
      await tx.classroomParticipant.update({ where: { id: target.id }, data: { inviteNonce: randomUUID(), connectionId: null, lastSeenAt: null } });
      return { ok: true };
    }
    if (input.action === "refreshRoster") {
      const enrollments = await tx.enrollment.findMany({ where: { groupId: session.groupId }, select: { studentId: true } });
      classroomAssert(enrollments.length <= 200, "الجلسة تدعم حتى ٢٠٠ طالب في القائمة.");
      await tx.classroomParticipant.createMany({ data: enrollments.map(({ studentId }) => ({ sessionId: session.id, studentId })), skipDuplicates: true });
      return { ok: true };
    }
    if (input.action === "estimate") {
      classroomAssert(Number.isInteger(input.count) && input.count >= 0 && input.count <= 300 && Number.isInteger(input.samples) && input.samples > 0 && input.samples <= 120, "تقدير الفيديو غير صالح.");
      await tx.classroomSession.update({ where: { id: session.id }, data: { headcountEstimate: input.count, headcountSamples: input.samples } });
      return { ok: true };
    }

    classroomAssert(session.status !== "ENDED", "الجلسة انتهت؛ الأسئلة والحضور السابق متاحين للعرض.", 409);
    if (["connect", "heartbeat"].includes(input.action)) {
      classroomAssert(CLASSROOM_CONNECTION.test(input.connectionId ?? ""), "أعد الانضمام للجلسة.");
      if (input.action === "heartbeat") classroomAssert(currentConnection(actor, session) === input.connectionId, "الجلسة مفتوحة في تبويب آخر. أعد الانضمام.", 409);
      if (actor.role === "TEACHER") {
        await tx.classroomSession.update({ where: { id: session.id }, data: { teacherConnectionId: input.connectionId, teacherLastSeenAt: now } });
      } else {
        await tx.classroomParticipant.update({
          where: { id: own.id }, data: {
            connectionId: input.connectionId, lastSeenAt: now,
            ...(session.status === "ACTIVE" && { joinedAt: own.joinedAt ?? now, attendedSeconds: { increment: own.joinedAt ? presenceSeconds(own.lastSeenAt, now) : 0 } }),
          },
        });
      }
      if (input.action === "connect") await tx.classroomSignal.deleteMany({ where: { sessionId: session.id, createdAt: { lt: new Date(now.getTime() - 120_000) } } });
      return { ok: true };
    }

    classroomAssert(session.status === "ACTIVE", "الجلسة لم تبدأ بعد.", 409);
    if (input.action === "hand") {
      classroomAssert(actor.role === "STUDENT" && typeof input.raised === "boolean", "طلب غير صالح.");
      await tx.classroomParticipant.update({ where: { id: own.id }, data: { handRaised: input.raised } });
      return { ok: true };
    }
    if (input.action === "message") {
      const body = typeof input.body === "string" ? input.body.trim() : "";
      classroomAssert(body && body.length <= CLASSROOM_MESSAGE_LIMIT, "اكتب رسالة حتى ٢٠٠٠ حرف.");
      const kinds = ["QUESTION", "REPLY", "ANNOUNCEMENT"];
      classroomAssert(kinds.includes(input.kind) && (actor.role === "TEACHER" || input.kind !== "ANNOUNCEMENT"), "نوع رسالة غير صالح.");
      let recipientId = null;
      let isPrivate = actor.role === "STUDENT";
      if (input.recipientId) {
        classroomAssert(actor.role === "TEACHER" && session.participants.some((row) => row.id === input.recipientId && isEnrolled(row, session)), "الطالب غير متاح.", 403);
        recipientId = input.recipientId;
        isPrivate = true;
      }
      let replyToId = null;
      if (input.replyToId != null) {
        classroomAssert(Number.isSafeInteger(input.replyToId), "الرسالة الأصلية غير صالحة.");
        const original = await tx.classroomMessage.findFirst({ where: { id: input.replyToId, sessionId: session.id } });
        classroomAssert(original && visibleMessage(actor, original), "الرسالة الأصلية غير متاحة.", 403);
        replyToId = original.id;
        if (original.isPrivate) {
          isPrivate = true;
          if (actor.role === "TEACHER") recipientId = original.senderId ?? original.recipientId;
        }
      }
      const recent = await tx.classroomMessage.count({ where: {
        sessionId: session.id, senderId: actor.role === "TEACHER" ? null : actor.participantId,
        createdAt: { gte: new Date(now.getTime() - 10_000) },
      } });
      classroomAssert(recent < 8, "انتظر لحظة قبل إرسال رسالة جديدة.", 429);
      const message = await tx.classroomMessage.create({ data: {
        sessionId: session.id, senderId: actor.role === "TEACHER" ? null : actor.participantId,
        recipientId, isPrivate, body, kind: input.kind, replyToId,
      }, select: { id: true } });
      return { ok: true, id: message.id };
    }
    if (input.action === "signal") {
      classroomAssert(session.mode === "LIVE", "هذه الجلسة فيديو مسجل.");
      classroomAssert(currentConnection(actor, session) === input.connectionId, "أعد الانضمام للجلسة.", 409);
      const fromPeer = classroomPeerId(actor, input.connectionId);
      const target = actor.role === "TEACHER"
        ? session.participants.some((row) => isEnrolled(row, session) && row.connectionId && `${row.id}:${row.connectionId}` === input.toPeer)
        : session.teacherConnectionId && input.toPeer === `teacher:${session.teacherConnectionId}`;
      classroomAssert(target, "اتصال الطالب أو المدرس تغير. أعد المحاولة.", 409);
      const payload = validateClassroomSignal(input.payload);
      const count = await tx.classroomSignal.count({ where: { sessionId: session.id, fromPeer, createdAt: { gte: new Date(now.getTime() - 10_000) } } });
      classroomAssert(count < 150, "محاولات اتصال كثيرة. أعد المحاولة لاحقاً.", 429);
      await tx.classroomSignal.create({ data: { sessionId: session.id, fromPeer, toPeer: input.toPeer, payload } });
      return { ok: true };
    }
    classroomAssert(false, "طلب غير معروف.");
  }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
}

export async function confirmClassroomAttendance(actor, input) {
  const session = await loadSession(actor);
  teacherOnly(actor, session);
  classroomAssert(input.confirmed === true, "راجع الحضور وأكد الاختيارات قبل الحفظ.");
  const date = session.attendanceDate.toISOString().slice(0, 10);
  classroomAssert(date <= cairoToday(), "لا يمكن حفظ حضور بتاريخ مستقبلي.");
  const students = session.participants.filter((row) => isEnrolled(row, session)).map((row) => row.studentId);
  const entries = input.entries;
  classroomAssert(Array.isArray(entries) && entries.length > 0 && entries.length === students.length, "اختار حالة كل طالب في القائمة.");
  classroomAssert(new Set(entries.map((row) => row?.studentId)).size === students.length && entries.every((row) => students.includes(row?.studentId) && statuses.includes(row.status) && (row.note == null || (typeof row.note === "string" && row.note.length <= 500))), "اختيارات الحضور غير صالحة.");
  await saveAttendance(session.groupId, date, entries.map((row) => ({ studentId: row.studentId, status: row.status, note: row.note || null })));
  await prisma.classroomSession.update({ where: { id: session.id }, data: { attendanceConfirmedAt: new Date() } });
  return { ok: true };
}

export async function classroomVideo(actor) {
  const session = await loadSession(actor);
  return { file: session.videoFile, name: session.videoName, mime: session.videoMime, size: session.videoSize };
}

export async function attachClassroomVideo(actor, video) {
  const session = await loadSession(actor);
  teacherOnly(actor, session);
  classroomAssert(session.mode === "RECORDING" && session.status === "DRAFT", "الفيديو متاح للرفع قبل بدء الجلسة فقط.", 409);
  const updated = await prisma.classroomSession.updateMany({
    where: { id: session.id, ownerId: actor.userId, status: "DRAFT", mode: "RECORDING" },
    data: { videoFile: video.file, videoName: video.name, videoMime: video.mime, videoSize: video.size, status: "ACTIVE", startedAt: new Date() },
  });
  classroomAssert(updated.count === 1, "حالة الجلسة تغيرت؛ أعد المحاولة.", 409);
}
