import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { isolatedDatabase } from "./isolated-database.mjs";

describe("student-only portal: authorization, schedule and privacy migration", { concurrency: false }, () => {
  let database, prisma, schedule, students, access, classroomAuth, createInvite;
  const priorUrl = process.env.DATABASE_URL;
  const priorSecret = process.env.CLASSROOM_INVITE_SECRET;
  before(async () => {
    database = await isolatedDatabase("student-portal");
    process.env.DATABASE_URL = database.connectionString;
    process.env.CLASSROOM_INVITE_SECRET = randomBytes(48).toString("base64url");
    ({ prisma } = await import("../src/lib/prisma.js"));
    schedule = await import("../src/lib/data/timetable.js");
    students = await import("../src/lib/data/students.js");
    access = await import("../src/lib/access.js");
    classroomAuth = await import("../src/lib/classroom-auth.js");
    ({ createClassroomInvite: createInvite } = await import("../src/lib/classroom-invites.js"));
  }, { timeout: 120_000 });

  after(async () => {
    await prisma?.$disconnect();
    await database?.server.close();
    if (priorUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.CLASSROOM_INVITE_SECRET;
    else process.env.CLASSROOM_INVITE_SECRET = priorSecret;
  });

  it("does not expose parent tables, parent phone columns, or parent role in the migrated database", async () => {
    const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Student' AND column_name IN ('parentPhone', 'studentPhone')`;
    assert.deepEqual(columns.map(r => r.column_name), ["studentPhone"]);
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('ParentStudent', 'ParentInvitation')`;
    assert.equal(tables.length, 0);
    const enumLabels = await prisma.$queryRaw`SELECT enumlabel FROM pg_enum
      WHERE enumtypid = '"Role"'::regtype ORDER BY enumsortorder`;
    assert.deepEqual(enumLabels.map(r => r.enumlabel), ["TEACHER", "STUDENT"]);
  });

  it("does not allow student access to another student record", async () => {
    const teacher = { role: "TEACHER", id: "teacher" };
    const student = { role: "STUDENT", studentProfile: { id: "student-a", archivedAt: null } };
    assert.equal(await access.canViewStudent(teacher, "student-b"), true);
    assert.equal(await access.canViewStudent(student, "student-a"), true);
    assert.equal(await access.canViewStudent(student, "student-b"), false);
    assert.equal(await access.canViewStudent({ role: "STUDENT", studentProfile: { id: "student-a", archivedAt: new Date() } }, "student-a"), false);
    assert.equal(await access.canViewStudent({ role: "STUDENT" }, "student-a"), false);
  });

  it("approves a student by email and revokes the old student linkage on reassignment", async () => {
    const row = await prisma.student.create({ data: { name: "Account Test", gradeLevel: "PRIMARY_1" } });
    const user = await prisma.user.create({ data: { clerkId: "student-portal-1", name: "Account Test", email: "a@student.test", role: "STUDENT" } });
    await students.setStudentLoginEmail(row.id, " A@STUDENT.TEST ");
    await prisma.student.update({ where: { id: row.id }, data: { userId: user.id } });
    await students.setStudentLoginEmail(row.id, "b@student.test");
    const changed = await prisma.student.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(changed.loginEmail, "b@student.test");
    assert.equal(changed.userId, null);
  });

  it("scopes lessons to active enrollments and respects cancellations and makeup days", async () => {
    const student = await prisma.student.create({ data: { name: "Schedule Student", gradeLevel: "PRIMARY_1" } });
    const group = await prisma.studyGroup.create({ data: { name: "Student portal schedule group", gradeLevel: "PRIMARY_1" } });
    const foreign = await prisma.studyGroup.create({ data: { name: "Student portal other group", gradeLevel: "PRIMARY_1" } });
    const membership = await prisma.enrollment.create({ data: { groupId: group.id, studentId: student.id } });
    const slot = await prisma.weeklySlot.create({ data: { groupId: group.id, day: "SAT", startTime: "16:00", endTime: "17:00" } });
    await prisma.weeklySlot.create({ data: { groupId: foreign.id, day: "SAT", startTime: "09:00", endTime: "10:00" } });
    await prisma.scheduleException.createMany({ data: [
      { groupId: group.id, slotId: slot.id, kind: "CANCEL", date: new Date("2026-10-10T00:00:00Z") },
      { groupId: group.id, kind: "MAKEUP", date: new Date("2026-10-11T00:00:00Z"), startTime: "11:00", endTime: "12:00" },
    ]});
    const result = await schedule.getStudentSchedule(student.id, "2026-10-10");
    assert.equal(result.upcomingSlots.filter(s => s.date === "2026-10-10").length, 0);
    assert.deepEqual(result.upcomingSlots.filter(s => s.date === "2026-10-11").map(s => s.kind), ["MAKEUP"]);
    assert.equal(result.upcomingSlots.filter(s => s.date === "2026-10-17").length, 1);
    assert.ok(result.upcomingSlots.every(s => s.groupId === group.id));
    await prisma.enrollment.update({ where: { id: membership.id }, data: { endedAt: new Date() } });
    assert.equal((await schedule.getStudentSchedule(student.id, "2026-10-10")).upcomingSlots.length, 0);
  });

  it("rejects expired classroom invites after enrollment ends", async () => {
    const teacher = await prisma.user.create({ data: { clerkId: "teacher-portal-1", email: "teacher@student-portal.test", name: "Teacher", role: "TEACHER" } });
    const student = await prisma.student.create({ data: { name: "Classroom Student", gradeLevel: "PRIMARY_2" } });
    const group = await prisma.studyGroup.create({ data: { name: "Student portal classroom group", gradeLevel: "PRIMARY_2" } });
    await prisma.enrollment.create({ data: { groupId: group.id, studentId: student.id } });
    const room = await prisma.classroomSession.create({ data: {
      ownerId: teacher.id, groupId: group.id, title: "Private lesson", mode: "LIVE",
      attendanceDate: new Date("2026-10-10T00:00:00Z"),
      participants: { create: { studentId: student.id } },
    }, include: { participants: true } });
    const token = createInvite(room.participants[0]);
    const actor = await classroomAuth.actorFromClassroomInvite(room.id, token);
    assert.equal(actor?.studentId, student.id);
    await prisma.enrollment.update({ where: { studentId_groupId: { studentId: student.id, groupId: group.id } }, data: { endedAt: new Date() } });
    assert.equal(await classroomAuth.actorFromClassroomInvite(room.id, token), null);
  });
});
