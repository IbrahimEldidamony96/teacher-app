import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { isolatedDatabase } from "./isolated-database.mjs";

// Exercises the *actual* destructive SQL against populated legacy tables.
// Disposable Prisma Dev PostgreSQL only; never loads application .env.
describe("legacy parent data destruction with student academic history preserved", { concurrency: false }, () => {
  let db, client;
  before(async () => {
    db = await isolatedDatabase("privacy-migration", { stopBeforeMigration: "20261014000000_student_accounts" });
    client = new pg.Client({ connectionString: db.connectionString });
    await client.connect();
  }, { timeout: 120_000 });
  after(async () => {
    await client?.end();
    await db?.server.close();
  });

  it("removes legacy parent identity and contact data without removing student, attendance, payments or exams", async () => {
    const oldParent = "old-parent@example.test";
    const oldPhone = "201111222333";
    const d = "2026-10-01";
    await client.query(`INSERT INTO "User" ("id", "clerkId", "email", "name", "role", "updatedAt")
      VALUES ('teacher-1', 'clerk-teacher-1', 'teacher@example.test', 'Teacher', 'TEACHER', NOW()),
             ('parent-1', 'clerk-parent-1', $1, 'Previous Parent', 'PARENT', NOW())`, [oldParent]);
    await client.query(`INSERT INTO "Student" ("id", "name", "gradeLevel", "parentPhone")
      VALUES ('student-1', 'Student One', 'PRIMARY_1', $1)`, [oldPhone]);
    await client.query(`INSERT INTO "ParentStudent" ("id", "parentId", "studentId")
      VALUES ('link-1', 'parent-1', 'student-1')`);
    await client.query(`INSERT INTO "ParentInvitation" ("id", "studentId", "email", "tokenHash", "expiresAt", "claimedById")
      VALUES ('invite-1', 'student-1', $1, 'hash-of-old-invite', NOW() + INTERVAL '1 day', 'parent-1')`, [oldParent]);
    await client.query(`INSERT INTO "Notification" ("id", "studentId", "type", "refId", "status")
      VALUES ('notification-1', 'student-1', 'PAYMENT_REMINDER', '2026-10', 'sent')`);
    await client.query(`INSERT INTO "StudyGroup" ("id", "name", "gradeLevel", "monthlyFee")
      VALUES ('group-1', 'Group One', 'PRIMARY_1', 250)`);
    await client.query(`INSERT INTO "Enrollment" ("id", "groupId", "studentId")
      VALUES ('enrollment-1', 'group-1', 'student-1')`);
    await client.query(`INSERT INTO "AttendanceRecord" ("id", "studentId", "groupId", "date", "status")
      VALUES ('attendance-1', 'student-1', 'group-1', $1::date, 'PRESENT')`, [d]);
    await client.query(`INSERT INTO "Payment" ("id", "studentId", "groupId", "month", "amount", "method")
      VALUES ('payment-1', 'student-1', 'group-1', '2026-10', 100, 'CASH')`);
    await client.query(`INSERT INTO "Exam" ("id", "groupId", "title", "date", "maxScore")
      VALUES ('exam-1', 'group-1', 'October test', $1::date, 20)`, [d]);
    await client.query(`INSERT INTO "ExamResult" ("id", "examId", "studentId", "score")
      VALUES ('result-1', 'exam-1', 'student-1', 18)`);
    await client.query(`INSERT INTO "CheckoutOrder" ("id", "studentId", "userId", "month", "amount", "updatedAt")
      VALUES ('old-parent-order', 'student-1', 'parent-1', '2026-10', 100, NOW())`);
    const sql = await readFile(new URL("../prisma/migrations/20261014000000_student_accounts/migration.sql", import.meta.url), "utf8");
    await client.query(sql);

    const oldRole = await client.query(`SELECT "id" FROM "User" WHERE "email" = $1`, [oldParent]);
    assert.equal(oldRole.rowCount, 0);
    const teacher = await client.query(`SELECT "role" FROM "User" WHERE "id" = 'teacher-1'`);
    assert.equal(teacher.rows[0].role, "TEACHER");
    const data = await client.query(`SELECT "name", "studentPhone", "loginEmail", "userId" FROM "Student" WHERE "id" = 'student-1'`);
    assert.deepEqual(data.rows[0], { name: "Student One", studentPhone: null, loginEmail: null, userId: null });
    for (const name of ["ParentStudent", "ParentInvitation"]) {
      const table = await client.query(`SELECT to_regclass($1) AS found`, [`public."${name}"`]);
      assert.equal(table.rows[0].found, null);
    }
    for (const table of ["Enrollment", "AttendanceRecord", "Payment", "ExamResult"]) {
      const rows = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      assert.equal(rows.rows[0].n, 1, table);
    }
    for (const table of ["Notification", "CheckoutOrder"]) {
      const rows = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      assert.equal(rows.rows[0].n, 0, table);
    }
    const columns = await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Student' AND column_name IN ('parentPhone', 'studentPhone')`);
    assert.deepEqual(columns.rows.map(row => row.column_name), ["studentPhone"]);
    const roles = await client.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid = '"Role"'::regtype ORDER BY enumsortorder`);
    assert.deepEqual(roles.rows.map(row => row.enumlabel), ["TEACHER", "STUDENT"]);
  });
});
