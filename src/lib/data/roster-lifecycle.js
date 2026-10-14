import { prisma } from "@/lib/prisma";
import { lockBilling, snapshotCharges } from "@/lib/data/payments";
import { cairoMonth } from "@/lib/time";
import { studentError } from "@/lib/student-validation";

async function changeArchive(model, id, archived) {
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    const record = await tx[model].findUnique({ where: { id }, select: { archivedAt: true } });
    if (!record) throw studentError(model === "student" ? "الطالب مش موجود." : "المجموعة مش موجودة.", "RECORD_MISSING");
    if (Boolean(record.archivedAt) === archived) return;
    const now = new Date();
    if (archived) {
      const filter = model === "student" ? { studentId: id } : { groupId: id };
      await snapshotCharges(tx, cairoMonth(), filter);
      await tx.enrollment.updateMany({ where: { ...filter, endedAt: null }, data: { endedAt: now } });
    }
    await tx[model].update({ where: { id }, data: { archivedAt: archived ? now : null } });
  }, { isolationLevel: "ReadCommitted" });
}

export function setStudentArchived(id, archived) { return changeArchive("student", id, archived); }
export function setGroupArchived(id, archived) { return changeArchive("studyGroup", id, archived); }

export function bulkEnrollStudents(groupId, studentIds, monthlyFee = null) {
  const ids = [...new Set(studentIds)];
  if (!ids.length || ids.length > 200) throw studentError("اختار من 1 إلى 200 طالب.");
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    const group = await tx.studyGroup.findUnique({ where: { id: groupId }, select: { archivedAt: true } });
    if (!group || group.archivedAt) throw studentError("اختار مجموعة نشطة.", "GROUP_ARCHIVED");
    const students = await tx.student.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
    if (students.length !== ids.length) throw studentError("فيه طالب مش موجود أو مؤرشف. حدّث القائمة وحاول تاني.", "STUDENT_ARCHIVED");
    const existing = await tx.enrollment.findMany({ where: { groupId, studentId: { in: ids } } });
    const enrolled = new Set(existing.filter((row) => !row.endedAt).map((row) => row.studentId));
    const now = new Date();
    for (const studentId of ids) {
      if (enrolled.has(studentId)) continue;
      await tx.enrollment.upsert({
        where: { studentId_groupId: { studentId, groupId } },
        create: { studentId, groupId, monthlyFee, joinedAt: now },
        update: { monthlyFee, joinedAt: now, endedAt: null },
      });
    }
    return { enrolled: ids.length - enrolled.size, skipped: enrolled.size };
  }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
}
