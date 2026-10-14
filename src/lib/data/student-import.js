import { prisma } from "@/lib/prisma";
import { lockBilling } from "@/lib/data/payments";
import { createStudentInTransaction, lockStudentIdentity } from "@/lib/data/students";
import { parseStudentCsv } from "@/lib/student-csv";
import { studentIdentity, studentError } from "@/lib/student-validation";

export async function previewStudentImport(source) {
  const rows = parseStudentCsv(source);
  const existing = await prisma.student.findMany({ select: { id: true, name: true, parentPhone: true, archivedAt: true } });
  const identities = new Map(existing.map((student) => [studentIdentity(student), student]).filter(([key]) => key));
  return rows.map((row) => {
    const match = identities.get(studentIdentity(row));
    return { ...row, status: row.errors.length ? "invalid" : match ? "duplicate" : "new", existingStudentId: match?.id ?? null, existingArchived: Boolean(match?.archivedAt) };
  });
}

export async function importStudents(source, groupId = null) {
  const rows = parseStudentCsv(source);
  if (rows.some((row) => row.errors.length)) throw studentError("صحّح الأخطاء في المعاينة قبل الاستيراد.");
  return prisma.$transaction(async (tx) => {
    // Acquire all identity locks in a stable order to make overlapping imports safe.
    if (groupId) {
      await lockBilling(tx);
      const group = await tx.studyGroup.findUnique({ where: { id: groupId }, select: { archivedAt: true } });
      if (!group || group.archivedAt) throw studentError("اختار مجموعة نشطة.", "GROUP_ARCHIVED");
    }
    const sorted = [...rows].sort((a, b) => (studentIdentity(a) ?? "").localeCompare(studentIdentity(b) ?? ""));
    for (const row of sorted) await lockStudentIdentity(tx, row);
    let created = 0, skipped = 0;
    for (const row of rows) {
      const result = await createStudentInTransaction(tx, { name: row.name, gradeLevel: row.gradeLevel, parentPhone: row.parentPhone, notes: row.notes, groupId });
      if (result.created) created += 1;
      else skipped += 1;
    }
    return { created, skipped };
  }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
}
