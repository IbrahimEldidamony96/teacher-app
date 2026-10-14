import { prisma } from "@/lib/prisma";
import { normalizeStudentPhone, normalizeStudentName } from "@/lib/student-identity";
import { studentError, studentIdentity } from "@/lib/student-validation";
import { lockBilling } from "@/lib/data/payments";

export function listStudents({ archived = "active" } = {}) {
  return prisma.student.findMany({
    where: archived === "all" ? {} : { archivedAt: archived === "archived" ? { not: null } : null },
    orderBy: { name: "asc" },
    include: {
      enrollments: { where: { endedAt: null }, include: { group: { select: { id: true, name: true } } } },
      account: { select: { id: true } },
    },
  });
}

export async function getStudentRoster({ search = "", gradeLevel = "", groupId = "", archived = "active", page = 1, pageSize = 25 } = {}) {
  const where = {
    ...(archived === "all" ? {} : { archivedAt: archived === "archived" ? { not: null } : null }),
    ...(gradeLevel ? { gradeLevel } : {}),
    ...(groupId ? { enrollments: { some: { groupId, endedAt: null } } } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { studentPhone: { contains: normalizeStudentPhone(search) || search } }] } : {}),
  };
  const total = await prisma.student.count({ where });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pages);
  const students = await prisma.student.findMany({
    where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (currentPage - 1) * pageSize, take: pageSize,
    include: { enrollments: { where: { endedAt: null }, include: { group: { select: { id: true, name: true } } } }, account: { select: { id: true } } },
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
      account: { select: { id: true, email: true } },
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
    select: { id: true, name: true, studentPhone: true, archivedAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return candidates.find((student) => studentIdentity(student) === identity) ?? null;
}

export async function createStudentInTransaction(tx, { name, gradeLevel, studentPhone, notes, groupId }) {
  const normalizedName = normalizeStudentName(name);
  const normalizedPhone = normalizeStudentPhone(studentPhone);
  await lockStudentIdentity(tx, { name: normalizedName, studentPhone: normalizedPhone });
  const existing = await findStudentIdentity(tx, { name: normalizedName, studentPhone: normalizedPhone });
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
        studentPhone: normalizedPhone,
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

// Only the teacher can approve a student's verified email address.
// Changing the email revokes the prior account's access immediately.
export async function setStudentLoginEmail(studentId, loginEmail) {
  const email = loginEmail.trim().toLowerCase();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    throw new Error("اكتب بريد إلكتروني صحيح للطالب.");
  }
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
    if (!rows.length) throw new Error("الطالب غير موجود.");
    const student = await tx.student.findUnique({ where: { id: studentId } });
    if (student.loginEmail === (email || null)) return student;
    const teacher = email && await tx.user.findFirst({ where: { email, role: "TEACHER" }, select: { id: true } });
    if (teacher) throw new Error("البريد الإلكتروني مخصص لحساب المدرس.");
    return tx.student.update({
      where: { id: studentId },
      data: { loginEmail: email || null, userId: null },
    });
  });
}
