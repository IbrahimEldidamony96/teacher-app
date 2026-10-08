import { prisma } from "@/lib/prisma";

export function listGroups() {
  return prisma.studyGroup.findMany({
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    include: { _count: { select: { enrollments: true, slots: true } } },
  });
}

export function getGroupDetail(id) {
  return prisma.studyGroup.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: { student: { select: { id: true, name: true, gradeLevel: true } } },
        orderBy: { student: { name: "asc" } },
      },
      slots: { orderBy: [{ day: "asc" }, { startTime: "asc" }] },
    },
  });
}

export function listStudentsNotInGroup(groupId) {
  return prisma.student.findMany({
    where: { enrollments: { none: { groupId } } },
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
    return await prisma.studyGroup.update({ where: { id }, data: { name, monthlyFee } });
  } catch (e) {
    if (e?.code === "P2002") throw new Error("فيه مجموعة بنفس الاسم دي.");
    throw e;
  }
}

// monthlyFee is optional: null means "use the group's fee"
export async function enrollStudent(groupId, studentId, monthlyFee = null) {
  await prisma.enrollment.createMany({
    data: [{ groupId, studentId, monthlyFee }],
    skipDuplicates: true,
  });
}

export function unenrollStudent(groupId, studentId) {
  return prisma.enrollment.deleteMany({ where: { groupId, studentId } });
}
