import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { isolatedDatabase } from "./isolated-database.mjs";

// Synthetic data in disposable PostgreSQL only. No application .env is loaded.
describe("student roster lifecycle", { concurrency: false }, () => {
  let server, prisma, students, lifecycle, imports;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  before(async () => {
    const isolated = await isolatedDatabase("roster-lifecycle");
    server = isolated.server;
    process.env.DATABASE_URL = isolated.connectionString;
    ({ prisma } = await import("../src/lib/prisma.js"));
    students = await import("../src/lib/data/students.js");
    lifecycle = await import("../src/lib/data/roster-lifecycle.js");
    imports = await import("../src/lib/data/student-import.js");
  }, { timeout: 120_000 });
  after(async () => {
    await prisma?.$disconnect();
    await server?.close();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("edits student details and rejects collisions including concurrent edits and creates", async () => {
    const first = (await students.createStudent({ name: "Edit First", gradeLevel: "PRIMARY_1", parentPhone: "01000000101" })).student;
    const second = (await students.createStudent({ name: "Edit Second", gradeLevel: "PRIMARY_1", parentPhone: "01000000102" })).student;
    const collision = await students.updateStudent(second.id, { name: "edit  first", gradeLevel: "PRIMARY_2", parentPhone: "+201000000101", notes: null });
    assert.equal(collision.updated, false);
    assert.equal(collision.existingStudentId, first.id);
    const results = await Promise.all([
      students.updateStudent(first.id, { name: "Concurrent Roster", gradeLevel: "PRIMARY_2", parentPhone: "201000000103", notes: "Changed" }),
      students.updateStudent(second.id, { name: "Concurrent Roster", gradeLevel: "PRIMARY_2", parentPhone: "201000000103", notes: "Changed" }),
      students.createStudent({ name: "Concurrent Roster", gradeLevel: "PRIMARY_2", parentPhone: "201000000103" }),
    ]);
    assert.equal(results.filter((row) => row.updated || row.created).length, 1);
    assert.equal(await prisma.student.count({ where: { name: "Concurrent Roster", parentPhone: "201000000103" } }), 1);
  });

  it("archives students without deleting payments/attendance and restores without reopening enrollments", async () => {
    const group = await prisma.studyGroup.create({ data: { name: "Student Archive Test", gradeLevel: "PRIMARY_3", monthlyFee: 120 } });
    const student = (await students.createStudent({ name: "Archive Student", gradeLevel: "PRIMARY_3", parentPhone: "01000000104", groupId: group.id })).student;
    await prisma.payment.create({ data: { studentId: student.id, groupId: group.id, month: "2026-10", amount: 60 } });
    await prisma.attendanceRecord.create({ data: { studentId: student.id, groupId: group.id, date: new Date("2026-10-01T00:00:00Z"), status: "PRESENT" } });
    await lifecycle.setStudentArchived(student.id, true);
    assert.ok((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).archivedAt);
    assert.equal(await prisma.enrollment.count({ where: { studentId: student.id, endedAt: null } }), 0);
    assert.equal(await prisma.payment.count({ where: { studentId: student.id } }), 1);
    assert.equal(await prisma.attendanceRecord.count({ where: { studentId: student.id } }), 1);
    assert.equal((await students.getStudentRoster({ search: "Archive Student" })).total, 0);
    assert.equal((await students.getStudentRoster({ search: "Archive Student", archived: "archived" })).total, 1);
    await assert.rejects(lifecycle.bulkEnrollStudents(group.id, [student.id]));
    await lifecycle.setStudentArchived(student.id, false);
    assert.equal(await prisma.enrollment.count({ where: { studentId: student.id, endedAt: null } }), 0);
    assert.deepEqual(await lifecycle.bulkEnrollStudents(group.id, [student.id], 80), { enrolled: 1, skipped: 0 });
    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { studentId_groupId: { studentId: student.id, groupId: group.id } } });
    assert.equal(enrollment.monthlyFee, 80);
    assert.equal(enrollment.endedAt, null);
  });

  it("archives groups and rejects new membership while preserving group history", async () => {
    const group = await prisma.studyGroup.create({ data: { name: "Group Archive Test", gradeLevel: "PRIMARY_4", monthlyFee: 100 } });
    const student = (await students.createStudent({ name: "Group Archive Student", gradeLevel: "PRIMARY_4", groupId: group.id })).student;
    await lifecycle.setGroupArchived(group.id, true);
    assert.equal(await prisma.student.count({ where: { id: student.id, archivedAt: null } }), 1);
    assert.equal(await prisma.enrollment.count({ where: { groupId: group.id, endedAt: null } }), 0);
    await assert.rejects(students.createStudent({ name: "Archived Group Rejected", gradeLevel: "PRIMARY_4", groupId: group.id }));
    assert.equal(await prisma.student.count({ where: { name: "Archived Group Rejected" } }), 0);
    await lifecycle.setGroupArchived(group.id, false);
    assert.equal(await prisma.enrollment.count({ where: { groupId: group.id, endedAt: null } }), 0);
  });

  it("filters and paginates the roster deterministically", async () => {
    await prisma.student.createMany({ data: Array.from({ length: 31 }, (_, index) => ({ name: `Paged Synthetic ${String(index).padStart(2, "0")}`, gradeLevel: "PREP_1" })) });
    const first = await students.getStudentRoster({ search: "Paged Synthetic", gradeLevel: "PREP_1", page: 1 });
    const second = await students.getStudentRoster({ search: "Paged Synthetic", gradeLevel: "PREP_1", page: 2 });
    assert.equal(first.total, 31);
    assert.equal(first.students.length, 25);
    assert.equal(second.students.length, 6);
    assert.equal(first.students[0].name, "Paged Synthetic 00");
    assert.equal(second.students[0].name, "Paged Synthetic 25");
  });

  it("previews import validation, skips existing identities and rolls back invalid imports", async () => {
    const group = await prisma.studyGroup.create({ data: { name: "CSV Import Group", gradeLevel: "SEC_1" } });
    const csv = 'name,gradeLevel,parentPhone,notes\n"CSV, First",SEC_1,01000000105,"A note"\nCSV Second,SEC_1,01000000106,\n';
    const preview = await imports.previewStudentImport(csv);
    assert.ok(preview.every((row) => row.status === "new"));
    assert.deepEqual(await imports.importStudents(csv, group.id), { created: 2, skipped: 0 });
    assert.ok((await imports.previewStudentImport(csv)).every((row) => row.status === "duplicate"));
    assert.deepEqual(await imports.importStudents(csv, group.id), { created: 0, skipped: 2 });
    assert.equal(await prisma.enrollment.count({ where: { groupId: group.id } }), 2);
    const count = await prisma.student.count();
    await assert.rejects(imports.importStudents("name,gradeLevel\nValid Synthetic,PRIMARY_1\nInvalid Synthetic,WRONG\n"));
    assert.equal(await prisma.student.count(), count);
  });

  it("bulk enrollment skips current memberships and rejects the entire selection if one student is archived", async () => {
    const group = await prisma.studyGroup.create({ data: { name: "Bulk Roster Test", gradeLevel: "SEC_2" } });
    const first = (await students.createStudent({ name: "Bulk Synthetic One", gradeLevel: "SEC_2" })).student;
    const second = (await students.createStudent({ name: "Bulk Synthetic Two", gradeLevel: "SEC_2" })).student;
    assert.deepEqual(await lifecycle.bulkEnrollStudents(group.id, [first.id, second.id, first.id], 50), { enrolled: 2, skipped: 0 });
    assert.deepEqual(await lifecycle.bulkEnrollStudents(group.id, [first.id, second.id], 75), { enrolled: 0, skipped: 2 });
    assert.equal((await prisma.enrollment.findFirstOrThrow({ where: { groupId: group.id, studentId: first.id } })).monthlyFee, 50);
    await lifecycle.setStudentArchived(second.id, true);
    await assert.rejects(lifecycle.bulkEnrollStudents(group.id, [first.id, second.id]));
  });
});
