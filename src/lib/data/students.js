import { prisma } from "@/lib/prisma";
import { normalizeParentPhone, normalizeStudentName } from "@/lib/student-identity";
import { studentError, studentIdentity } from "@/lib/student-validation";
import { lockBilling } from "@/lib/data/payments";

export function listStudents({ archived = "active" } = {}) {
  return prisma.student.findMany({
    where: archived === "all" ? {} : { archivedAt: archived === "archived" ? { not: null } : null },
    orderBy: { name: "asc" },
    include: {
      enrollments: { where: { endedAt: null }, include: { group: { select: { id: true, name: true } } } },
      parents: { select: { id: true } },
    },
  });
}

export async function getStudentRoster({ search = "", gradeLevel = "", groupId = "", archived = "active", page = 1, pageSize = 25 } = {}) {
  const where = {
    ...(archived === "all" ? {} : { archivedAt: archived === "archived" ? { not: null } : null }),
    ...(gradeLevel ? { gradeLevel } : {}),
    ...(groupId ? { enrollments: { some: { groupId, endedAt: null } } } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { parentPhone: { contains: normalizeParentPhone(search) || search } }] } : {}),
  };
  const total = await prisma.student.count({ where });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pages);
  const students = await prisma.student.findMany({
    where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (currentPage - 1) * pageSize, take: pageSize,
    include: { enrollments: { where: { endedAt: null }, include: { group: { select: { id: true, name: true } } } }, parents: { select: { id: true } } },
  });
  return { students, total, pages, page: currentPage };
}

export function getStudentDetail(id) {
  return prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        orderBy: [{ endedAt: "asc" }, { joinedAt: "desc" }],
        include: { group: { select: { id: true, name: true, gradeLevel: true, monthlyFee: true } } },
      },
      parents: {
        include: { parent: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

export async function lockStudentIdentity(tx, input) {
  const identity = studentIdentity(input);
  if (!identity) return;
  const [identityName, normalizedPhone] = JSON.parse(identity);
  const identityKey = JSON.stringify(["student-create", identityName, normalizedPhone]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))`;
}

export async function findStudentIdentity(tx, input, excludeId = null) {
  const identity = studentIdentity(input);
  if (!identity) return null;
  const candidates = await tx.student.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { id: true, name: true, parentPhone: true, archivedAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return candidates.find((student) => studentIdentity(student) === identity) ?? null;
}

export async function createStudentInTransaction(tx, { name, gradeLevel, parentPhone, notes, groupId }) {
  const normalizedName = normalizeStudentName(name);
  const normalizedPhone = normalizeParentPhone(parentPhone);
  await lockStudentIdentity(tx, { name: normalizedName, parentPhone: normalizedPhone });
  const existing = await findStudentIdentity(tx, { name: normalizedName, parentPhone: normalizedPhone });
  if (existing) return { created: false, student: { id: existing.id } };
  if (groupId) {
    const group = await tx.studyGroup.findUnique({ where: { id: groupId }, select: { archivedAt: true } });
    if (!group) throw studentError("المجموعة مش موجودة. اختار مجموعة تانية.", "GROUP_MISSING");
    if (group.archivedAt) throw studentError("المجموعة مؤرشفة. استرجعها قبل إضافة طلاب.", "GROUP_ARCHIVED");
  }
  const student = await tx.student.create({
      data: {
        name: normalizedName,
        gradeLevel,
        parentPhone: normalizedPhone,
        notes,
        ...(groupId && {
          enrollments: { create: { group: { connect: { id: groupId } } } },
        }),
      },
    });
  return { created: true, student };
}

export function createStudent(input) {
  return prisma.$transaction(async (tx) => {
    // Shared with archive and enrollment mutations so an archived group cannot
    // receive a student from an in-flight creation request.
    if (input.groupId) await lockBilling(tx);
    return createStudentInTransaction(tx, input);
  }, { isolationLevel: "ReadCommitted" });
}

export function updateStudent(studentId, data) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE`;
    const current = await tx.student.findUnique({ where: { id: studentId } });
    if (!current) throw studentError("الطالب مش موجود.", "STUDENT_MISSING");
    await lockStudentIdentity(tx, data);
    const duplicate = await findStudentIdentity(tx, data, studentId);
    if (duplicate) return { updated: false, existingStudentId: duplicate.id };
    await tx.student.update({ where: { id: studentId }, data });
    return { updated: true };
  }, { isolationLevel: "ReadCommitted" });
}

// Parent accounts (signed-up users with role PARENT) not yet linked to this student
export function listLinkableParents(studentId) {
  return prisma.user.findMany({
    where: { role: "PARENT", children: { none: { studentId } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function linkParent(studentId, parentId) {
  const parent = await prisma.user.findFirst({
    where: { id: parentId, role: "PARENT" },
    select: { id: true },
  });
  if (!parent) throw new Error("ولي الأمر مش موجود.");

  await prisma.parentStudent.createMany({
    data: [{ studentId, parentId }],
    skipDuplicates: true,
  });
}

export function unlinkParent(studentId, parentId) {
  return prisma.parentStudent.deleteMany({ where: { studentId, parentId } });
}
