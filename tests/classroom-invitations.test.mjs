import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { isolatedDatabase } from "./isolated-database.mjs";
import { verifyClassroomInvite } from "../src/lib/classroom-invites.js";

// This suite uses disposable PostgreSQL, dummy message credentials, and a fetch
// replacement that never calls the network. It does not load any .env files.
describe("live classroom WhatsApp invitations", { concurrency: false }, () => {
  let database, prisma, classrooms, invitations, teacher, otherTeacher;
  let calls = [], templateStatus = "APPROVED", templateError = null, transport = async () => new Response("{}", { status: 200 });
  const savedFetch = globalThis.fetch;
  const environmentKeys = [
    "DATABASE_URL", "CLASSROOM_INVITE_SECRET", "CLASSROOM_PUBLIC_URL",
    "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_BUSINESS_ACCOUNT_ID",
  ];
  const savedEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const publicOrigin = "https://classroom-invitations.test";

  before(async () => {
    database = await isolatedDatabase("classroom-invitation-tests");
    process.env.DATABASE_URL = database.connectionString;
    process.env.CLASSROOM_INVITE_SECRET = randomBytes(48).toString("base64url");
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    process.env.WHATSAPP_PHONE_NUMBER_ID = "isolated-test-phone";
    process.env.WHATSAPP_ACCESS_TOKEN = "isolated-test-token";
    process.env.WHATSAPP_GRAPH_VERSION = "v-test";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "";
    globalThis.fetch = async (url, options) => {
      // Prisma dev publishes disposable query/WAL insights through fetch too.
      // Acknowledge those local stream writes without involving the network.
      const request = new URL(String(url));
      if (request.hostname === "127.0.0.1" && /^\/v1\/stream\/prisma-(queries|wal)$/.test(request.pathname)) {
        return new Response("{}", { status: 200 });
      }
      if (request.pathname === "/v-test/isolated-test-account/message_templates") {
        assert.equal(request.origin, "https://graph.facebook.com");
        assert.equal(options.method, "GET");
        assert.equal(options.headers.Authorization, "Bearer isolated-test-token");
        if (templateError) return Response.json({ error: templateError }, { status: 401 });
        return Response.json({ data: [{ name: "classroom_invitation", language: "ar", status: templateStatus }] });
      }
      assert.equal(String(url), "https://graph.facebook.com/v-test/isolated-test-phone/messages");
      assert.equal(options.headers.Authorization, "Bearer isolated-test-token");
      const body = JSON.parse(options.body);
      calls.push(body);
      return transport(body);
    };
    ({ prisma } = await import("../src/lib/prisma.js"));
    classrooms = await import("../src/lib/data/classrooms.js");
    invitations = await import("../src/lib/data/classroom-invitations.js");
    teacher = await prisma.user.create({ data: {
      clerkId: "user_invitation_teacher", email: "teacher@invitations.test", name: "Invitation Teacher", role: "TEACHER",
    } });
    otherTeacher = await prisma.user.create({ data: {
      clerkId: "user_other_invitation_teacher", email: "other@invitations.test", name: "Other Teacher", role: "TEACHER",
    } });
  }, { timeout: 120_000 });

  beforeEach(() => {
    calls = [];
    transport = async () => new Response("{}", { status: 200 });
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    process.env.WHATSAPP_ACCESS_TOKEN = "isolated-test-token";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "";
    templateStatus = "APPROVED";
    templateError = null;
  });

  after(async () => {
    try { await prisma?.$disconnect(); } finally {
      globalThis.fetch = savedFetch;
      await database?.server.close();
      for (const [key, value] of Object.entries(savedEnvironment)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  async function room({ mode = "LIVE", active = true, connected = true, phones = ["01012345678", "01012345678", null] } = {}) {
    const group = await prisma.studyGroup.create({ data: { name: `Invitation Group ${randomUUID()}`, gradeLevel: "PRIMARY_1" } });
    const students = await Promise.all(phones.map((parentPhone, index) => prisma.student.create({ data: {
      name: `Invitation Student ${index + 1}`, gradeLevel: "PRIMARY_1", parentPhone,
      enrollments: { create: { groupId: group.id } },
    } })));
    const session = await classrooms.createClassroom(teacher, { title: "Live Invitation Lesson", groupId: group.id, mode, date: "2026-10-01" });
    const owner = { sessionId: session.id, role: "TEACHER", userId: teacher.id, name: teacher.name };
    const connectionId = randomUUID();
    if (connected) await classrooms.changeClassroom(owner, { action: "connect", connectionId });
    if (active) {
      if (mode === "LIVE") await classrooms.changeClassroom(owner, { action: "start" });
      else await classrooms.attachClassroomVideo(owner, { file: `${randomUUID()}.webm`, name: "test.webm", mime: "video/webm", size: 100 });
    }
    const participants = await prisma.classroomParticipant.findMany({ where: { sessionId: session.id } });
    const studentActor = {
      sessionId: session.id, role: "STUDENT", participantId: participants[0].id,
      studentId: participants[0].studentId, name: "Invitation Student",
    };
    const input = { connectionId, requestOrigin: publicOrigin };
    return { owner, studentActor, group, students, participants, input };
  }

  const send = (lesson, studentIds = lesson.students.map((student) => student.id)) => invitations.sendClassroomInvitations(lesson.owner, { ...lesson.input, studentIds });
  const prepare = (lesson) => invitations.prepareClassroomInvitations(lesson.owner, lesson.input);
  const hasStatus = (status) => (error) => error.status === status;
  const parameters = (body) => body.template.components[0].parameters.map((parameter) => parameter.text);

  it("allows only the owning teacher to prepare or send invitations", async () => {
    const lesson = await room();
    for (const actor of [lesson.studentActor, { ...lesson.owner, userId: otherTeacher.id }, { ...lesson.owner, role: "PARENT" }]) {
      await assert.rejects(invitations.prepareClassroomInvitations(actor, lesson.input), hasStatus(403));
      await assert.rejects(invitations.sendClassroomInvitations(actor, { ...lesson.input, studentIds: [lesson.students[0].id] }), hasStatus(403));
    }
    assert.equal((await prepare(lesson)).roster.length, 3);
    assert.equal(calls.length, 0);
  });

  it("requires an active live lesson and the current connected teacher tab", async () => {
    const draft = await room({ active: false });
    const recording = await room({ mode: "RECORDING" });
    const disconnected = await room({ connected: false });
    const ended = await room();
    await classrooms.changeClassroom(ended.owner, { action: "end" });
    const stale = await room();
    await prisma.classroomSession.update({ where: { id: stale.owner.sessionId }, data: { teacherLastSeenAt: new Date(Date.now() - 120_000) } });
    const otherTab = await room();
    await classrooms.changeClassroom(otherTab.owner, { action: "connect", connectionId: randomUUID() });
    for (const lesson of [draft, recording, disconnected, ended, stale, otherTab]) {
      await assert.rejects(prepare(lesson), hasStatus(409));
      await assert.rejects(send(lesson), hasStatus(409));
    }
    assert.equal(calls.length, 0);
  });

  it("accepts public HTTPS origins and rejects private hosts or embedded URL data", () => {
    delete process.env.CLASSROOM_PUBLIC_URL;
    assert.equal(invitations.classroomInvitationOrigin(publicOrigin), publicOrigin);
    const invalid = [
      undefined, "http://classroom-invitations.test", "https://localhost", "https://teacher.local", "https://teacher.internal",
      "https://127.0.0.1", "https://10.0.0.1", "https://192.168.0.1", "https://172.16.1.1", "https://169.254.1.1",
      "https://100.64.0.1", "https://[::1]", "https://[fd00::1]", "https://[fe80::1]", "https://[::ffff:127.0.0.1]",
      `${publicOrigin}/lesson`, `${publicOrigin}?student=123`, `${publicOrigin}#lesson`, "https://user:secret@classroom-invitations.test",
    ];
    for (const origin of invalid) assert.throws(() => invitations.classroomInvitationOrigin(origin), hasStatus(409), String(origin));
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    assert.equal(invitations.classroomInvitationOrigin("http://localhost:3000"), publicOrigin);
    process.env.CLASSROOM_PUBLIC_URL = "http://localhost:3000";
    assert.throws(() => invitations.classroomInvitationOrigin(publicOrigin), hasStatus(409));
  });

  it("blocks preparation without WhatsApp configuration or a public application URL", async () => {
    const lesson = await room();
    process.env.WHATSAPP_ACCESS_TOKEN = "";
    await assert.rejects(prepare(lesson), hasStatus(409));
    process.env.WHATSAPP_ACCESS_TOKEN = "isolated-test-token";
    process.env.CLASSROOM_PUBLIC_URL = "http://localhost:3000";
    await assert.rejects(prepare(lesson), hasStatus(409));
    await assert.rejects(send(lesson), hasStatus(409));
    assert.equal(calls.length, 0);
  });

  it("explains pending approval before any student send or failed delivery record, then allows an approved retry", async () => {
    const lesson = await room();
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "isolated-test-account";
    templateStatus = "PENDING";
    await assert.rejects(prepare(lesson), (error) => error.status === 409 && /في انتظار موافقة Meta/.test(error.message));
    assert.equal(calls.length, 0);
    assert.equal(await prisma.notification.count({ where: { studentId: { in: lesson.students.map((student) => student.id) } } }), 0);
    templateStatus = "APPROVED";
    assert.equal((await prepare(lesson)).roster.length, 3);
    assert.deepEqual((await send(lesson)).results.map((student) => student.status), ["sent", "sent", "skipped_no_phone"]);
    assert.equal(calls.length, 2);
  });

  it("blocks an expired token before a five-student send or failure records, then allows a valid-token retry", async () => {
    const lesson = await room({ phones: Array(5).fill("01012345678") });
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "isolated-test-account";
    templateError = { code: 190, error_subcode: 463, message: "isolated-test-token +201012345678 private-provider-message" };
    await assert.rejects(prepare(lesson), (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /WHATSAPP_ACCESS_TOKEN.*\.env.*أعد تشغيل/);
      for (const sentinel of ["isolated-test-token", "201012345678", "private-provider-message"]) {
        assert.equal(error.message.includes(sentinel), false, sentinel);
      }
      return true;
    });
    assert.equal(calls.length, 0);
    assert.equal(await prisma.notification.count({ where: { studentId: { in: lesson.students.map((student) => student.id) } } }), 0);
    templateError = null;
    assert.equal((await prepare(lesson)).roster.length, 5);
    assert.deepEqual((await send(lesson)).results.map((student) => student.status), Array(5).fill("sent"));
    assert.equal(calls.length, 5);
  });

  it("refreshes the current enrollment roster and never sends to a departed student", async () => {
    const lesson = await room();
    const departed = lesson.students[0];
    await prisma.enrollment.delete({ where: { studentId_groupId: { studentId: departed.id, groupId: lesson.group.id } } });
    const added = await prisma.student.create({ data: {
      name: "Newly Enrolled Student", gradeLevel: "PRIMARY_1", parentPhone: "01112345678",
      enrollments: { create: { groupId: lesson.group.id } },
    } });
    const state = await prepare(lesson);
    assert.deepEqual(new Set(state.roster.map((student) => student.studentId)), new Set([lesson.students[1].id, lesson.students[2].id, added.id]));
    for (const student of state.roster) {
      const invite = new URL(student.invitePath);
      assert.equal(invite.origin, publicOrigin);
      assert.equal(invite.pathname, `/api/classrooms/${lesson.owner.sessionId}/invite`);
      assert.ok(invite.searchParams.get("token"));
    }
    delete process.env.CLASSROOM_PUBLIC_URL;
    const localState = await classrooms.getClassroomState(lesson.owner);
    assert.ok(localState.roster.every((student) => student.invitePath.startsWith(`/api/classrooms/${lesson.owner.sessionId}/invite?token=`)));
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    assert.equal((await prepare(lesson)).roster.length, 3);
    await assert.rejects(send(lesson, [departed.id]), hasStatus(403));
    const result = await send(lesson, state.roster.map((student) => student.studentId));
    assert.equal(result.results.filter((student) => student.status === "sent").length, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls.some((body) => parameters(body)[0] === departed.name), false);
  });

  it("sends each sibling a distinct valid private invitation and skips missing phone numbers", async () => {
    const lesson = await room();
    const result = await send(lesson);
    assert.deepEqual(result.results.map((student) => student.status), ["sent", "sent", "skipped_no_phone"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((body) => body.to), ["201012345678", "201012345678"]);
    const tokens = [];
    for (const body of calls) {
      assert.equal(body.messaging_product, "whatsapp");
      assert.equal(body.type, "template");
      assert.equal(body.template.name, "classroom_invitation");
      assert.equal(body.template.language.code, "ar");
      const [name, group, title, link] = parameters(body);
      assert.equal(group, lesson.group.name);
      assert.equal(title, "Live Invitation Lesson");
      const student = lesson.students.find((row) => row.name === name);
      const participant = lesson.participants.find((row) => row.studentId === student.id);
      const url = new URL(link);
      assert.equal(url.origin, publicOrigin);
      assert.equal(url.pathname, `/api/classrooms/${lesson.owner.sessionId}/invite`);
      const token = url.searchParams.get("token");
      assert.ok(verifyClassroomInvite(participant, token));
      for (const other of lesson.participants.filter((row) => row.id !== participant.id)) assert.equal(verifyClassroomInvite(other, token), false);
      tokens.push(token);
    }
    assert.equal(new Set(tokens).size, 2);
    const notices = await prisma.notification.findMany({ where: { studentId: { in: lesson.students.map((row) => row.id) }, type: "CLASSROOM_INVITATION" } });
    assert.equal(notices.length, 3);
    assert.deepEqual(new Set(notices.map((notice) => notice.status)), new Set(["sent", "skipped_no_phone"]));
  });

  it("reports partial provider failures safely, deduplicates sent invitations, and retries failures", async (t) => {
    const logger = t.mock.method(console, "warn", () => {});
    const lesson = await room({ phones: ["01012345678", "01112345678"] });
    const failedStudent = lesson.students[1];
    transport = async (body) => parameters(body)[0] === failedStudent.name
      ? Response.json({ error: {
        code: 100, error_subcode: 33,
        message: `provider failure: ${parameters(body)[3]} ${body.to} isolated-test-token`,
      } }, { status: 400 })
      : new Response("{}", { status: 200 });
    const initial = await send(lesson);
    assert.deepEqual(initial.results.map((student) => student.status), ["sent", "failed"]);
    const failure = initial.results[1];
    assert.match(failure.error, /Phone Number ID/);
    assert.equal(failure.error.includes("token="), false);
    assert.equal(failure.error.includes("201112345678"), false);
    const failureNotice = await prisma.notification.findFirstOrThrow({ where: { studentId: failedStudent.id, type: "CLASSROOM_INVITATION" } });
    assert.equal(failureNotice.error, failure.error);
    assert.deepEqual(logger.mock.calls[0].arguments, ["Classroom WhatsApp invitation failed", {
      httpStatus: 400, providerCode: 100, providerSubcode: 33,
    }]);
    const exposed = JSON.stringify([initial, failureNotice.error, logger.mock.calls.map((call) => call.arguments)]);
    for (const sentinel of ["token=", "201112345678", "isolated-test-token", "provider failure:"]) {
      assert.equal(exposed.includes(sentinel), false, sentinel);
    }
    transport = async () => new Response("{}", { status: 200 });
    const retried = await send(lesson);
    assert.deepEqual(retried.results.map((student) => student.status), ["already_sent", "sent"]);
    assert.equal(calls.length, 3);
    assert.deepEqual((await send(lesson)).results.map((student) => student.status), ["already_sent", "already_sent"]);
    assert.equal(calls.length, 3);
  });

  it("persists and returns an actionable missing-template explanation without provider details", async (t) => {
    const logger = t.mock.method(console, "warn", () => {});
    const lesson = await room({ phones: ["01012345678"] });
    transport = async (body) => Response.json({ error: {
      code: 132001, message: `${parameters(body)[3]} ${body.to} isolated-test-token`,
    } }, { status: 400 });
    const result = await send(lesson);
    const failure = result.results[0];
    assert.equal(failure.status, "failed");
    assert.match(failure.error, /classroom_invitation.*العربية.*WhatsApp Manager/);
    const notice = await prisma.notification.findFirstOrThrow({ where: { studentId: lesson.students[0].id, type: "CLASSROOM_INVITATION" } });
    assert.equal(notice.error, failure.error);
    assert.deepEqual(logger.mock.calls[0].arguments, ["Classroom WhatsApp invitation failed", {
      httpStatus: 400, providerCode: 132001,
    }]);
    const exposed = JSON.stringify([result, notice.error, logger.mock.calls.map((call) => call.arguments)]);
    for (const sentinel of ["token=", "201012345678", "isolated-test-token"]) assert.equal(exposed.includes(sentinel), false, sentinel);
  });

  it("deduplicates overlapping simultaneous send requests", async () => {
    const lesson = await room({ phones: ["01012345678", "01112345678", "01212345678"] });
    transport = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response("{}", { status: 200 });
    };
    const firstIds = lesson.students.slice(0, 2).map((student) => student.id);
    const secondIds = lesson.students.slice(1, 3).map((student) => student.id);
    const results = await Promise.all([send(lesson, firstIds), send(lesson, secondIds)]);
    assert.equal(calls.length, 3);
    assert.equal(results.flatMap((result) => result.results).filter((row) => row.status === "sent").length, 3);
    assert.equal(results.flatMap((result) => result.results).filter((row) => row.status === "already_sent").length, 1);
    const sent = await prisma.notification.findMany({ where: { type: "CLASSROOM_INVITATION", studentId: { in: lesson.students.map((student) => student.id) }, status: "sent" } });
    assert.equal(sent.length, 3);
    assert.equal(new Set(sent.map((notice) => notice.studentId)).size, 3);
  });

  it("delivers a replacement invitation after rotation and invalidates the previously sent link", async () => {
    const lesson = await room({ phones: ["01012345678"] });
    await send(lesson);
    const oldToken = new URL(parameters(calls[0])[3]).searchParams.get("token");
    await classrooms.changeClassroom(lesson.owner, { action: "rotateInvite", participantId: lesson.participants[0].id });
    const replacement = await send(lesson);
    assert.equal(replacement.results[0].status, "sent");
    assert.equal(calls.length, 2);
    const updated = await prisma.classroomParticipant.findUniqueOrThrow({ where: { id: lesson.participants[0].id } });
    const newToken = new URL(parameters(calls[1])[3]).searchParams.get("token");
    assert.notEqual(newToken, oldToken);
    assert.equal(verifyClassroomInvite(updated, oldToken), false);
    assert.equal(verifyClassroomInvite(updated, newToken), true);
  });

  it("rejects oversized, duplicate, empty, malformed, and foreign recipient batches before sending", async () => {
    const lesson = await room({ phones: Array(6).fill("01012345678") });
    const foreign = await room({ phones: ["01112345678"] });
    const id = lesson.students[0].id;
    for (const studentIds of [[], [id, id], lesson.students.map((student) => student.id), [null], [""], ["x".repeat(101)]]) {
      await assert.rejects(send(lesson, studentIds), hasStatus(400));
    }
    await assert.rejects(send(lesson, [id, foreign.students[0].id]), hasStatus(403));
    assert.equal(calls.length, 0);
    assert.equal((await send(lesson, lesson.students.slice(0, 5).map((student) => student.id))).results.length, 5);
    assert.equal(calls.length, 5);
  });
});
