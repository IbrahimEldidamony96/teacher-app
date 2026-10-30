import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { isolatedDatabase } from "./isolated-database.mjs";
import { createClassroomInvite, verifyClassroomInvite } from "../src/lib/classroom-invites.js";
import { classroomVideoRange, detectClassroomVideo, classroomVideoPath } from "../src/lib/classroom-video.js";
import { createPrismaPgAdapter } from "../src/lib/prisma-pool.js";

// No .env files are loaded. Application data and external message credentials
// are never used by this suite.
describe("classrooms", { concurrency: false }, () => {
  let database, prisma, api, teacher, otherTeacher, group;
  const saved = Object.fromEntries(["DATABASE_URL", "CLASSROOM_INVITE_SECRET", "WHATSAPP_ACCESS_TOKEN"].map((key) => [key, process.env[key]]));
  before(async () => {
    database = await isolatedDatabase("classroom-tests");
    process.env.DATABASE_URL = database.connectionString;
    process.env.CLASSROOM_INVITE_SECRET = randomBytes(48).toString("base64url");
    process.env.WHATSAPP_ACCESS_TOKEN = "";
    ({ prisma } = await import("../src/lib/prisma.js"));
    api = await import("../src/lib/data/classrooms.js");
    teacher = await prisma.user.create({ data: { clerkId: "user_classroom_teacher", email: "teacher@classrooms.test", name: "Test Teacher", role: "TEACHER" } });
    otherTeacher = await prisma.user.create({ data: { clerkId: "user_other_teacher", email: "other@classrooms.test", name: "Other Teacher", role: "TEACHER" } });
    group = await prisma.studyGroup.create({ data: { name: "Isolated Classroom Group", gradeLevel: "PRIMARY_1", monthlyFee: 0 } });
    await Promise.all(["Test Student A", "Test Student B"].map((name) => prisma.student.create({ data: { name, gradeLevel: "PRIMARY_1", enrollments: { create: { groupId: group.id } } } })));
  }, { timeout: 120_000 });
  after(async () => {
    try { await prisma?.$disconnect(); } finally {
      await database?.server.close();
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  async function room(mode = "LIVE") {
    const result = await api.createClassroom(teacher, { title: "Test Lesson", groupId: group.id, mode, date: "2026-10-01" });
    const session = await prisma.classroomSession.findUniqueOrThrow({ where: { id: result.id }, include: { participants: { orderBy: { studentId: "asc" } } } });
    const owner = { sessionId: result.id, role: "TEACHER", userId: teacher.id, name: teacher.name };
    const actors = session.participants.map((participant) => ({ sessionId: result.id, role: "STUDENT", participantId: participant.id, studentId: participant.studentId, name: "Test Student" }));
    return { session, owner, actors };
  }
  it("creates invitations only for the enrolled roster and rejects future or empty lessons", async () => {
    const { session } = await room();
    assert.equal(session.participants.length, 2);
    assert.equal(await prisma.attendanceRecord.count(), 0);
    await assert.rejects(api.createClassroom(teacher, { title: "Future", groupId: group.id, mode: "LIVE", date: "2999-01-01" }));
    const empty = await prisma.studyGroup.create({ data: { name: "Empty", gradeLevel: "PRIMARY_1" } });
    await assert.rejects(api.createClassroom(teacher, { title: "Empty", groupId: empty.id, mode: "LIVE", date: "2026-10-01" }));
  });
  it("prevents other teachers and forged student identities from reading or changing a lesson", async () => {
    const { owner, actors } = await room();
    await assert.rejects(api.getClassroomState({ ...owner, userId: otherTeacher.id }));
    await assert.rejects(api.changeClassroom({ ...owner, userId: otherTeacher.id }, { action: "start" }));
    await assert.rejects(api.getClassroomState({ ...actors[0], studentId: actors[1].studentId }));
    await assert.rejects(api.changeClassroom(actors[0], { action: "start" }));
  });
  it("binds an invitation to its lesson, student, and revocable nonce", async () => {
    const { session, owner } = await room();
    const participant = session.participants[0];
    const token = createClassroomInvite(participant);
    assert.ok(verifyClassroomInvite(participant, token));
    assert.equal(verifyClassroomInvite({ ...participant, sessionId: "another-session" }, token), false);
    assert.equal(verifyClassroomInvite({ ...participant, studentId: "another-student" }, token), false);
    await api.changeClassroom(owner, { action: "rotateInvite", participantId: participant.id });
    const rotated = await prisma.classroomParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    assert.equal(verifyClassroomInvite(rotated, token), false);
  });
  it("revokes access when enrollment is removed and refreshes invitations for newly enrolled students", async () => {
    const { owner, actors } = await room();
    await prisma.enrollment.delete({ where: { studentId_groupId: { studentId: actors[0].studentId, groupId: group.id } } });
    try {
      await assert.rejects(api.getClassroomState(actors[0]));
      assert.equal((await api.getClassroomState(owner)).roster.length, 1);
    } finally { await prisma.enrollment.create({ data: { studentId: actors[0].studentId, groupId: group.id } }); }
    const added = await prisma.student.create({ data: { name: "Added Test Student", gradeLevel: "PRIMARY_1", enrollments: { create: { groupId: group.id } } } });
    try {
      await api.changeClassroom(owner, { action: "refreshRoster" });
      assert.equal((await api.getClassroomState(owner)).roster.length, 3);
      await api.changeClassroom(owner, { action: "refreshRoster" });
      assert.equal((await api.getClassroomState(owner)).roster.length, 3);
    } finally { await prisma.student.delete({ where: { id: added.id } }); }
  });
  it("keeps student questions and teacher replies private while supporting questions to the class", async () => {
    const { owner, actors } = await room();
    await api.changeClassroom(owner, { action: "start" });
    const question = await api.changeClassroom(actors[0], { action: "message", kind: "QUESTION", body: "Private student question" });
    assert.equal((await api.getClassroomState(actors[1])).messages.length, 0);
    await api.changeClassroom(owner, { action: "message", kind: "REPLY", body: "Private teacher answer", replyToId: question.id });
    await api.changeClassroom(owner, { action: "message", kind: "QUESTION", body: "Question for everyone" });
    assert.equal((await api.getClassroomState(actors[0])).messages.length, 3);
    assert.deepEqual((await api.getClassroomState(actors[1])).messages.map((row) => row.body), ["Question for everyone"]);
    const privateTeacherQuestion = await api.changeClassroom(owner, { action: "message", kind: "QUESTION", body: "Question for B", recipientId: actors[1].participantId });
    await api.changeClassroom(actors[1], { action: "message", kind: "REPLY", body: "B answer", replyToId: privateTeacherQuestion.id });
    assert.equal((await api.getClassroomState(actors[0])).messages.length, 3);
    assert.equal((await api.getClassroomState(owner)).messages.length, 5);
  });
  it("rejects cross-lesson and private-message replies, other recipients, and student announcements", async () => {
    const first = await room(), second = await room();
    await api.changeClassroom(first.owner, { action: "start" });
    await api.changeClassroom(second.owner, { action: "start" });
    const question = await api.changeClassroom(first.actors[0], { action: "message", kind: "QUESTION", body: "Private" });
    await assert.rejects(api.changeClassroom(first.actors[1], { action: "message", kind: "REPLY", body: "Forged", replyToId: question.id }));
    await assert.rejects(api.changeClassroom(second.owner, { action: "message", kind: "REPLY", body: "Cross session", replyToId: question.id }));
    await assert.rejects(api.changeClassroom(first.owner, { action: "message", kind: "QUESTION", body: "Cross recipient", recipientId: second.actors[0].participantId }));
    await assert.rejects(api.changeClassroom(first.actors[0], { action: "message", kind: "ANNOUNCEMENT", body: "Forged teacher message" }));
  });
  it("rate-limits repeated questions and returns ordered message history without losing older messages", async () => {
    const { owner, actors } = await room();
    await api.changeClassroom(owner, { action: "start" });
    for (let i = 0; i < 8; i += 1) await api.changeClassroom(actors[0], { action: "message", kind: "QUESTION", body: `Message ${i}` });
    await assert.rejects(api.changeClassroom(actors[0], { action: "message", kind: "QUESTION", body: "Too many" }), (error) => error.status === 429);
    await prisma.classroomMessage.createMany({ data: Array.from({ length: 110 }, (_, i) => ({ sessionId: owner.sessionId, body: `History ${i}`, kind: "ANNOUNCEMENT" })) });
    const current = await api.getClassroomState(actors[1]);
    assert.equal(current.messages.length, 100);
    const older = await api.getClassroomState(actors[1], { messageBefore: current.messages[0].id });
    assert.equal(older.messages.length, 10);
    assert.ok(older.messages.at(-1).id < current.messages[0].id);
    assert.equal((await api.getClassroomState(actors[1], { messageAfter: current.messages.at(-1).id })).messages.length, 0);
  });
  it("suggests attendance from active join evidence without counting waiting time or writing attendance", async () => {
    const { owner, actors } = await room();
    const connectionId = randomUUID();
    await api.changeClassroom(actors[0], { action: "connect", connectionId });
    await prisma.classroomParticipant.update({ where: { id: actors[0].participantId }, data: { lastSeenAt: new Date(Date.now() - 15_000) } });
    await api.changeClassroom(owner, { action: "start" });
    await api.changeClassroom(actors[0], { action: "heartbeat", connectionId });
    let participant = await prisma.classroomParticipant.findUniqueOrThrow({ where: { id: actors[0].participantId } });
    assert.ok(participant.joinedAt);
    assert.equal(participant.attendedSeconds, 0);
    await prisma.classroomParticipant.update({ where: { id: participant.id }, data: { lastSeenAt: new Date(Date.now() - 10_000) } });
    await api.changeClassroom(actors[0], { action: "heartbeat", connectionId });
    participant = await prisma.classroomParticipant.findUniqueOrThrow({ where: { id: participant.id } });
    assert.ok(participant.attendedSeconds >= 10 && participant.attendedSeconds < 13);
    await api.changeClassroom(owner, { action: "estimate", count: 4, samples: 12 });
    assert.equal(await prisma.attendanceRecord.count(), 0);
    const studentState = await api.getClassroomState(actors[0]);
    assert.equal(studentState.roster, undefined);
    assert.equal(JSON.stringify(studentState).includes("inviteNonce"), false);
  });
  it("delivers signaling only to the current peer and rejects student-to-student or stale connections", async () => {
    const { owner, actors } = await room();
    const teacherId = randomUUID(), studentId = randomUUID(), otherId = randomUUID();
    await api.changeClassroom(owner, { action: "connect", connectionId: teacherId });
    await api.changeClassroom(actors[0], { action: "connect", connectionId: studentId });
    await api.changeClassroom(actors[1], { action: "connect", connectionId: otherId });
    await api.changeClassroom(owner, { action: "start" });
    const signal = { action: "signal", connectionId: teacherId, toPeer: `${actors[0].participantId}:${studentId}`, payload: { description: { type: "offer", sdp: "v=0\r\n" } } };
    await api.changeClassroom(owner, signal);
    assert.equal((await api.getClassroomState(actors[0], { connectionId: studentId })).signals.length, 1);
    assert.equal((await api.getClassroomState(actors[1], { connectionId: otherId })).signals.length, 0);
    // Starting or stopping student capture renegotiates the existing teacher link.
    await api.changeClassroom(actors[0], { ...signal, connectionId: studentId, toPeer: `teacher:${teacherId}` });
    const teacherSignals = (await api.getClassroomState(owner, { connectionId: teacherId })).signals;
    assert.equal(teacherSignals.length, 1);
    assert.equal(teacherSignals[0].fromPeer, `${actors[0].participantId}:${studentId}`);
    assert.equal(teacherSignals[0].payload.description.type, "offer");
    assert.equal((await api.getClassroomState(actors[1], { connectionId: otherId })).signals.length, 0);
    await assert.rejects(api.changeClassroom(actors[1], { ...signal, connectionId: otherId }));
    await api.changeClassroom(actors[0], { action: "connect", connectionId: randomUUID() });
    assert.equal((await api.getClassroomState(actors[0], { connectionId: studentId })).signals.length, 0);
    await assert.rejects(api.changeClassroom(owner, signal));
    await assert.rejects(api.changeClassroom(actors[0], { action: "heartbeat", connectionId: studentId }));
  });
  it("preserves presence and signaling while polling and heartbeats run concurrently", { timeout: 60_000 }, async () => {
    const { owner, actors } = await room();
    const connections = [randomUUID(), randomUUID(), randomUUID()];
    await api.changeClassroom(owner, { action: "start" });
    for (const [index, actor] of [owner, ...actors].entries()) {
      await api.changeClassroom(actor, { action: "connect", connectionId: connections[index] });
    }
    await prisma.classroomParticipant.updateMany({
      where: { sessionId: owner.sessionId }, data: { lastSeenAt: new Date(Date.now() - 10_000) },
    });
    await api.changeClassroom(owner, { action: "message", kind: "ANNOUNCEMENT", body: "Concurrent lesson" });
    const attendanceBefore = await prisma.attendanceRecord.count({ where: { groupId: group.id } });
    const signal = {
      action: "signal", connectionId: connections[0], toPeer: `${actors[0].participantId}:${connections[1]}`,
      payload: { description: { type: "offer", sdp: "v=0\r\n" } },
    };
    for (let round = 0; round < 12; round += 1) {
      // These 96 overlapping calls exercise the local protocol collision that
      // previously caused intermittent P2039 failures in polling and heartbeats.
      const results = await Promise.all([
        api.getClassroomState(owner, { connectionId: connections[0] }),
        api.getClassroomState(owner, { connectionId: connections[0] }),
        api.getClassroomState(actors[0], { connectionId: connections[1] }),
        api.getClassroomState(actors[1], { connectionId: connections[2] }),
        ...[owner, ...actors].map((actor, index) => api.changeClassroom(actor, { action: "heartbeat", connectionId: connections[index] })),
        api.changeClassroom(owner, signal),
      ]);
      for (const state of results.slice(0, 4)) {
        assert.equal(state.session.status, "ACTIVE");
        assert.equal(state.connectionCurrent, true);
        assert.deepEqual(state.messages.map((message) => message.body), ["Concurrent lesson"]);
      }
    }
    const teacherState = await api.getClassroomState(owner, { connectionId: connections[0] });
    assert.equal(teacherState.peers.length, 2);
    assert.ok(teacherState.roster.every((participant) => participant.online && participant.attendedSeconds >= 10));
    const targetState = await api.getClassroomState(actors[0], { connectionId: connections[1] });
    assert.equal(targetState.signals.length, 12);
    assert.ok(targetState.signals.every((row) => row.fromPeer === `teacher:${connections[0]}`));
    assert.equal((await api.getClassroomState(actors[1], { connectionId: connections[2] })).signals.length, 0);
    assert.equal(await prisma.attendanceRecord.count({ where: { groupId: group.id } }), attendanceBefore);
  });
  it("supports two app clients sharing the local database during concurrent reads and heartbeats", { timeout: 60_000 }, async () => {
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const secondClient = new PrismaClient({ adapter: createPrismaPgAdapter(database.connectionString) });
    try {
      const { owner, actors } = await room();
      const connections = [randomUUID(), randomUUID(), randomUUID()];
      await api.changeClassroom(owner, { action: "start" });
      for (const [index, actor] of [owner, ...actors].entries()) {
        await api.changeClassroom(actor, { action: "connect", connectionId: connections[index] });
      }
      await api.changeClassroom(owner, { action: "message", kind: "ANNOUNCEMENT", body: "Shared local database" });
      const attendanceBefore = await prisma.attendanceRecord.count({ where: { groupId: group.id } });
      for (let round = 0; round < 12; round += 1) {
        const results = await Promise.all([
          api.getClassroomState(owner, { connectionId: connections[0] }),
          api.getClassroomState(actors[0], { connectionId: connections[1] }),
          api.getClassroomState(actors[1], { connectionId: connections[2] }),
          api.changeClassroom(actors[0], { action: "heartbeat", connectionId: connections[1] }),
          secondClient.classroomSession.findUniqueOrThrow({
            where: { id: owner.sessionId },
            include: { participants: { include: { student: { include: { enrollments: true } } } }, owner: true, group: true },
          }),
          secondClient.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`classroom:${owner.sessionId}`}, 0))`;
            const session = await tx.classroomSession.findUniqueOrThrow({ where: { id: owner.sessionId } });
            assert.equal(session.teacherConnectionId, connections[0]);
            await tx.classroomSession.update({ where: { id: owner.sessionId }, data: { teacherLastSeenAt: new Date() } });
          }, { timeout: 15_000 }),
          secondClient.classroomMessage.findMany({ where: { sessionId: owner.sessionId } }),
          secondClient.attendanceRecord.count({ where: { groupId: group.id } }),
        ]);
        for (const state of results.slice(0, 3)) {
          assert.equal(state.session.status, "ACTIVE");
          assert.equal(state.connectionCurrent, true);
          assert.deepEqual(state.messages.map((message) => message.body), ["Shared local database"]);
        }
        assert.equal(results[4].participants.length, 2);
        assert.deepEqual(results[6].map((message) => message.body), ["Shared local database"]);
        assert.equal(results[7], attendanceBefore);
      }
      // A failed standalone query must roll back and return its connection for
      // later requests rather than leave the shared multiplexer pinned.
      await assert.rejects(secondClient.$queryRaw`SELECT 1 / 0`);
      assert.equal((await secondClient.$queryRaw`SELECT 1 AS ready`)[0].ready, 1);
      assert.equal((await api.getClassroomState(owner, { connectionId: connections[0] })).connectionCurrent, true);
    } finally {
      await secondClient.$disconnect();
    }
  });
  it("requires a teacher-confirmed complete roster before writing manual attendance statuses", async () => {
    const { owner, actors } = await room();
    const entries = actors.map((actor, i) => ({ studentId: actor.studentId, status: i ? "LATE" : "EXCUSED", note: "Teacher reviewed" }));
    await assert.rejects(api.confirmClassroomAttendance(owner, { confirmed: false, entries }));
    await assert.rejects(api.confirmClassroomAttendance(owner, { confirmed: true, entries: entries.slice(0, 1) }));
    await assert.rejects(api.confirmClassroomAttendance(actors[0], { confirmed: true, entries }));
    assert.equal(await prisma.attendanceRecord.count(), 0);
    await api.confirmClassroomAttendance(owner, { confirmed: true, entries });
    const records = await prisma.attendanceRecord.findMany({ where: { groupId: group.id } });
    assert.equal(records.length, 2);
    assert.deepEqual(new Set(records.map((row) => row.status)), new Set(["LATE", "EXCUSED"]));
    assert.ok((await api.getClassroomState(owner)).session.attendanceConfirmedAt);
  });
  it("activates an uploaded recording only once and blocks student upload permissions", async () => {
    const { owner, actors } = await room("RECORDING");
    await assert.rejects(api.changeClassroom(owner, { action: "start" }));
    const metadata = { file: `${randomUUID()}.webm`, name: "test.webm", mime: "video/webm", size: 100 };
    await assert.rejects(api.attachClassroomVideo(actors[0], metadata));
    await api.attachClassroomVideo(owner, metadata);
    assert.equal((await api.getClassroomState(owner)).session.status, "ACTIVE");
    await assert.rejects(api.attachClassroomVideo(owner, { ...metadata, file: `${randomUUID()}.webm` }));
  });
  it("preserves the lesson archive after ending while blocking further messages and restarts", async () => {
    const { owner, actors } = await room();
    await api.changeClassroom(owner, { action: "start" });
    await api.changeClassroom(actors[0], { action: "message", kind: "QUESTION", body: "Archive" });
    await api.changeClassroom(owner, { action: "end" });
    assert.equal((await api.getClassroomState(actors[0])).messages[0].body, "Archive");
    await assert.rejects(api.changeClassroom(actors[0], { action: "message", kind: "QUESTION", body: "Too late" }));
    await assert.rejects(api.changeClassroom(owner, { action: "start" }));
  });
  it("supports video byte ranges and rejects invalid containers, traversal, and unsatisfiable ranges", () => {
    assert.deepEqual(classroomVideoRange("bytes=0-9", 100), { start: 0, end: 9 });
    assert.deepEqual(classroomVideoRange("bytes=90-", 100), { start: 90, end: 99 });
    assert.deepEqual(classroomVideoRange("bytes=-20", 100), { start: 80, end: 99 });
    for (const value of ["bytes=100-", "bytes=9-2", "bytes=-0", "bytes=1-2,4-5", "bytes=99999999999999999-"]) assert.throws(() => classroomVideoRange(value, 100));
    assert.equal(detectClassroomVideo(Buffer.from("Not a video file")), null);
    assert.equal(detectClassroomVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])).mime, "video/webm");
    assert.throws(() => classroomVideoPath("../../.env"));
  });
});
