import { prisma } from "@/lib/prisma";
import { normalizeParentPhone, normalizeStudentName } from "@/lib/student-identity";

export function listStudents() {
  return prisma.student.findMany({
    orderBy: { name: "asc" },
    include: {
      enrollments: { include: { group: { select: { id: true, name: true } } } },
      parents: { select: { id: true } },
    },
  });
}

export function getStudentDetail(id) {
  return prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { group: { select: { id: true, name: true, gradeLevel: true, monthlyFee: true } } },
      },
      parents: {
        include: { parent: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

export function createStudent({ name, gradeLevel, parentPhone, notes, groupId }) {
  const normalizedName = normalizeStudentName(name);
  const identityName = normalizedName.toLowerCase();
  const normalizedPhone = normalizeParentPhone(parentPhone);

  return prisma.$transaction(async (tx) => {
    if (normalizedPhone) {
      const identityKey = JSON.stringify([
        "student-create",
        identityName,
        normalizedPhone,
      ]);

      // Serialize creation for this identity, including simultaneous submissions.
      // Existing duplicate records can keep their attendance and enrollment history.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))
      `;
      // Use the same normalization for legacy records and the lock key.
      // Database lowercase rules can differ from JavaScript for Unicode names.
      const candidates = await tx.student.findMany({
        select: { id: true, name: true, parentPhone: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const existing = candidates.find(
        (student) =>
          normalizeStudentName(student.name).toLowerCase() === identityName &&
          normalizeParentPhone(student.parentPhone) === normalizedPhone
      );
      if (existing) return { created: false, student: { id: existing.id } };
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
