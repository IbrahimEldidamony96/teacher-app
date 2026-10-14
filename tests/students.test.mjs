import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { isolatedDatabase } from "./isolated-database.mjs";

// These tests never load .env or connect to the application's database.
// Each run uses an independent, disposable PostgreSQL instance.
describe("student creation", { concurrency: false }, () => {
  let server;
  let prisma;
  let createStudent;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  before(async () => {
    const isolated = await isolatedDatabase("student-tests");
    server = isolated.server;
    process.env.DATABASE_URL = isolated.connectionString;

    ({ prisma } = await import("../src/lib/prisma.js"));
    ({ createStudent } = await import("../src/lib/data/students.js"));
  }, { timeout: 120_000 });

  after(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await server?.close();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns the original student when the same name and parent phone are submitted again", async () => {
    const input = {
      name: "Repeated Test Student",
      gradeLevel: "PRIMARY_1",
      parentPhone: "01000000001",
      notes: "Original notes",
    };
    const first = await createStudent(input);
    const repeated = await createStudent({ ...input, gradeLevel: "PREP_1", notes: "Replacement notes" });

    assert.equal(first.created, true);
    assert.equal(repeated.created, false);
    assert.equal(repeated.student.id, first.student.id);
    assert.equal(await prisma.student.count({ where: { id: first.student.id } }), 1);
    const stored = await prisma.student.findUniqueOrThrow({ where: { id: first.student.id } });
    assert.equal(stored.gradeLevel, "PRIMARY_1");
    assert.equal(stored.notes, "Original notes");
  });

  it("recognizes equivalent whitespace, case, Unicode names, and Egyptian phone formats", async () => {
    const first = await createStudent({
      name: "  Ｆｏｒｍａｔ\u00a0STUDENT  ",
      gradeLevel: "PRIMARY_2",
      parentPhone: "011 2345 6789",
    });
    assert.equal(first.created, true);
    assert.equal(first.student.name, "Format STUDENT");
    assert.equal(first.student.parentPhone, "201123456789");

    for (const parentPhone of [
      "+20 (11) 2345-6789",
      "00201123456789",
      "٠١١٢٣٤٥٦٧٨٩",
      "۰۱۱۲۳۴۵۶۷۸۹",
    ]) {
      const repeated = await createStudent({
        name: "format \t\n student",
        gradeLevel: "PRIMARY_2",
        parentPhone,
      });
      assert.equal(repeated.created, false);
      assert.equal(repeated.student.id, first.student.id);
    }
  });

  it("allows siblings using the same parent phone and matching names with different phones", async () => {
    const inputs = [
      { name: "Sibling Test One", parentPhone: "01000000002" },
      { name: "Sibling Test Two", parentPhone: "01000000002" },
      { name: "Sibling Test One", parentPhone: "01000000003" },
    ];
    const results = [];
    for (const input of inputs) results.push(await createStudent({ ...input, gradeLevel: "PRIMARY_3" }));

    assert.ok(results.every((result) => result.created));
    assert.equal(new Set(results.map((result) => result.student.id)).size, 3);
  });

  it("allows matching names when a parent phone has not been provided", async () => {
    const results = [];
    for (const parentPhone of [undefined, "", "   "]) {
      results.push(await createStudent({ name: "No Phone Test Student", gradeLevel: "PRIMARY_4", parentPhone }));
    }
    assert.ok(results.every((result) => result.created));
    assert.equal(new Set(results.map((result) => result.student.id)).size, 3);
    assert.ok(results.every((result) => result.student.parentPhone === null));
  });

  it("creates only one record when duplicate submissions arrive concurrently", { timeout: 30_000 }, async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createStudent({
        name: index % 2 ? "Concurrent   Test Student" : "concurrent test student",
        gradeLevel: "PRIMARY_5",
        parentPhone: index % 2 ? "+20 10 0000 0004" : "01000000004",
      }))
    );

    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.student.id)).size, 1);
    assert.equal(await prisma.student.count({ where: { parentPhone: "201000000004" } }), 1);
  });

  it("rejects another duplicate of legacy records while preserving their enrollment and payment history", async () => {
    const group = await prisma.studyGroup.create({
      data: { name: "Legacy History Test Group", gradeLevel: "PRIMARY_6", monthlyFee: 100 },
    });
    const first = await prisma.student.create({
      data: {
        name: "  Legacy   Test Student  ",
        gradeLevel: "PRIMARY_6",
        parentPhone: "010 0000 0005",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        enrollments: { create: { groupId: group.id } },
        payments: { create: { groupId: group.id, month: "2026-10", amount: 100 } },
      },
    });
    const second = await prisma.student.create({
      data: {
        name: "legacy test student",
        gradeLevel: "PRIMARY_6",
        parentPhone: "+201000000005",
        createdAt: new Date("2020-01-02T00:00:00Z"),
      },
    });
    const beforeCount = await prisma.student.count();
    const duplicate = await createStudent({
      name: "Legacy Test Student",
      gradeLevel: "PRIMARY_6",
      parentPhone: "٠١٠٠٠٠٠٠٠٠٥",
      groupId: group.id,
    });

    assert.equal(duplicate.created, false);
    assert.equal(duplicate.student.id, first.id);
    assert.equal(await prisma.student.count(), beforeCount);
    assert.equal(await prisma.student.count({ where: { id: { in: [first.id, second.id] } } }), 2);
    assert.equal(await prisma.enrollment.count({ where: { studentId: first.id } }), 1);
    assert.equal(await prisma.payment.count({ where: { studentId: first.id } }), 1);
  });

  it("creates an enrollment atomically and does not enroll an existing duplicate in another group", async () => {
    const firstGroup = await prisma.studyGroup.create({
      data: { name: "Enrollment Test First Group", gradeLevel: "PREP_1" },
    });
    const otherGroup = await prisma.studyGroup.create({
      data: { name: "Enrollment Test Other Group", gradeLevel: "PREP_1" },
    });
    const input = { name: "Enrolled Test Student", gradeLevel: "PREP_1", parentPhone: "01000000006" };
    const first = await createStudent({ ...input, groupId: firstGroup.id });
    const duplicate = await createStudent({ ...input, groupId: otherGroup.id });

    assert.equal(first.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.student.id, first.student.id);
    const enrollments = await prisma.enrollment.findMany({ where: { studentId: first.student.id } });
    assert.equal(enrollments.length, 1);
    assert.equal(enrollments[0].groupId, firstGroup.id);
  });

  it("rolls back student creation when the selected group is invalid", async () => {
    const beforeCount = await prisma.student.count();
    const input = { name: "Rollback Test Student", gradeLevel: "PREP_2", parentPhone: "01000000007" };
    await assert.rejects(createStudent({ ...input, groupId: "missing-test-group" }));
    assert.equal(await prisma.student.count(), beforeCount);
    const valid = await createStudent(input);
    assert.equal(valid.created, true);
  });

  it("uses the same Unicode name identity for legacy matching and concurrent creation locks", async () => {
    const legacy = await prisma.student.create({
      data: {
        name: "\uFEFFΟΣ\uFEFF",
        gradeLevel: "PREP_3",
        parentPhone: "01000000008",
      },
    });
    const repeated = await createStudent({
      name: "ος",
      gradeLevel: "PREP_3",
      parentPhone: "+20 10 0000 0008",
    });
    assert.equal(repeated.created, false);
    assert.equal(repeated.student.id, legacy.id);

    // JavaScript lowercasing preserves the distinction between final and ordinary sigma.
    const distinctSigma = await createStudent({
      name: "οσ",
      gradeLevel: "PREP_3",
      parentPhone: "01000000008",
    });
    assert.equal(distinctSigma.created, true);
    assert.notEqual(distinctSigma.student.id, legacy.id);

    const plainI = await createStudent({
      name: "Ibrahim",
      gradeLevel: "PREP_3",
      parentPhone: "01000000009",
    });
    const dottedI = await createStudent({
      name: "İbrahim",
      gradeLevel: "PREP_3",
      parentPhone: "01000000009",
    });
    assert.equal(plainI.created, true);
    assert.equal(dottedI.created, true);
    assert.notEqual(dottedI.student.id, plainI.student.id);
    const dottedRepeat = await createStudent({
      name: "İBRAHIM",
      gradeLevel: "PREP_3",
      parentPhone: "01000000009",
    });
    assert.equal(dottedRepeat.created, false);
    assert.equal(dottedRepeat.student.id, dottedI.student.id);
  });
});
