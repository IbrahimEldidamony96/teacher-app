import { prisma } from "@/lib/prisma";
import { lockBilling, snapshotCharges } from "@/lib/data/payments";
import { cairoMonth } from "@/lib/time";

export function listGroups({ includeArchived = false, archived = "active" } = {}) {
  return prisma.studyGroup.findMany({
    where: includeArchived || archived === "all" ? {} : { archivedAt: archived === "archived" ? { not: null } : null },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    include: { _count: { select: { enrollments: { where: { endedAt: null, student: { archivedAt: null } } }, slots: true } } },
  });
}

export function getGroupDetail(id) {
  return prisma.studyGroup.findUnique({
    where: { id },
    include: {
      enrollments: {
        where: { endedAt: null, student: { archivedAt: null } },
        include: { student: { select: { id: true, name: true, gradeLevel: true } } },
        orderBy: { student: { name: "asc" } },
      },
      slots: { orderBy: [{ day: "asc" }, { startTime: "asc" }] },
    },
  });
}

export function listStudentsNotInGroup(groupId) {
  return prisma.student.findMany({
    where: { archivedAt: null, enrollments: { none: { groupId, endedAt: null } } },
    select: { id: true, name: true, gradeLevel: true },
    orderBy: { name: "asc" },
  });
}

export async function createGroup({ name, gradeLevel, monthlyFee }) {
  try {
    return await prisma.studyGroup.create({ data: { name, gradeLevel, monthlyFee } });
  } catch (e) {
    if (e?.code === "P2002") throw new Error("فيه مجموعة بنفس الاسم دي.");
    throw e;
  }
}

export async function updateGroup(id, { name, monthlyFee }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockBilling(tx);
      await snapshotCharges(tx, cairoMonth(), { groupId: id });
      return tx.studyGroup.update({ where: { id }, data: { name, monthlyFee } });
    });
  } catch (e) {
    if (e?.code === "P2002") throw new Error("فيه مجموعة بنفس الاسم دي.");
    throw e;
  }
}

// monthlyFee is optional: null means "use the group's fee"
export async function enrollStudent(groupId, studentId, monthlyFee = null) {
  if (monthlyFee !== null && (!Number.isSafeInteger(monthlyFee) || monthlyFee < 0)) throw new Error("الاشتراك غير صالح.");
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    const [student, group] = await Promise.all([tx.student.findFirst({ where: { id: studentId, archivedAt: null } }), tx.studyGroup.findFirst({ where: { id: groupId, archivedAt: null } })]);
    if (!student || !group) throw new Error("الطالب أو المجموعة غير متاح.");
    const existing = await tx.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
    if (existing && !existing.endedAt) return existing;
    const enrollment = await tx.enrollment.upsert({ where: { studentId_groupId: { studentId, groupId } }, create: { groupId, studentId, monthlyFee }, update: { joinedAt: new Date(), endedAt: null, monthlyFee } });
    await snapshotCharges(tx, cairoMonth(), { studentId, groupId });
    return enrollment;
  });
}

export async function unenrollStudent(groupId, studentId) {
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    await snapshotCharges(tx, cairoMonth(), { groupId, studentId });
    return tx.enrollment.updateMany({ where: { groupId, studentId, endedAt: null }, data: { endedAt: new Date() } });
  });
}

export async function updateEnrollmentFee(groupId, studentId, monthlyFee) {
  if (monthlyFee !== null && (!Number.isSafeInteger(monthlyFee) || monthlyFee < 0)) throw new Error("الاشتراك غير صالح.");
  return prisma.$transaction(async (tx) => {
    await lockBilling(tx);
    await snapshotCharges(tx, cairoMonth(), { groupId, studentId });
    return tx.enrollment.update({ where: { studentId_groupId: { studentId, groupId } }, data: { monthlyFee } });
  });
}
