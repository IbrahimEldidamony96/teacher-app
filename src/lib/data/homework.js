import { prisma } from "@/lib/prisma";
import { cairoToday, toDbDate } from "@/lib/time";
import { notifyHomeworkAssigned } from "@/lib/notify";

export function listHomework(groupId = null) {
  return prisma.homework.findMany({
    where: groupId ? { groupId } : {},
    include: {
      group: { select: { id: true, name: true, _count: { select: { enrollments: true } } } },
      results: { select: { status: true } },
    },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function createHomework({ groupId, title, description, dueDate }) {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    include: { enrollments: { include: { student: { select: { id: true, name: true, parentPhone: true } } } } },
  });
  if (!group) throw new Error("المجموعة مش موجودة.");

  const homework = await prisma.homework.create({
    data: {
      groupId,
      title,
      description,
      assignedOn: toDbDate(cairoToday()),
      dueDate: toDbDate(dueDate),
    },
  });

  // One WhatsApp message per enrolled student's parent. Never blocks or fails the save.
  await Promise.allSettled(
    group.enrollments.map(({ student }) =>
      notifyHomeworkAssigned({
        studentId: student.id,
        studentPhone: student.parentPhone,
        studentName: student.name,
        homeworkTitle: title,
        dueDate: homework.dueDate,
        homeworkId: homework.id,
      })
    )
  );

  return homework;
}

export function deleteHomework(homeworkId) {
  return prisma.homework.deleteMany({ where: { id: homeworkId } });
}

// Everything needed to render one homework's check sheet
export async function getHomeworkSheet(homeworkId) {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      results: true,
      group: {
        select: {
          id: true,
          name: true,
          enrollments: {
            select: { student: { select: { id: true, name: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
    },
  });
  if (!homework) return null;

  const byStudent = new Map(homework.results.map((r) => [r.studentId, r]));
  return {
    homework: {
      id: homework.id,
      title: homework.title,
      description: homework.description,
      dueDate: homework.dueDate,
      groupId: homework.group.id,
      groupName: homework.group.name,
    },
    students: homework.group.enrollments.map(({ student }) => ({
      id: student.id,
      name: student.name,
      status: byStudent.get(student.id)?.status ?? null,
      note: byStudent.get(student.id)?.note ?? "",
    })),
  };
}

// entries: [{ studentId, status, note }]
export async function saveHomeworkResults(homeworkId, entries) {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { groupId: true },
  });
  if (!homework) throw new Error("الواجب مش موجود.");

  const ids = [...new Set(entries.map((e) => e.studentId))];
  const enrolled = await prisma.enrollment.findMany({
    where: { groupId: homework.groupId, studentId: { in: ids } },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length) throw new Error("فيه طالب مش في المجموعة دي.");

  await prisma.$transaction(
    entries.map((e) =>
      prisma.homeworkResult.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId: e.studentId } },
        update: { status: e.status, note: e.note },
        create: { homeworkId, studentId: e.studentId, status: e.status, note: e.note },
      })
    )
  );
}

// Upcoming (not yet checked for this student) and the latest checked homework
export async function getStudentHomework(studentId, limit = 10) {
  const today = toDbDate(cairoToday());

  const [upcoming, checked] = await Promise.all([
    prisma.homework.findMany({
      where: {
        dueDate: { gte: today },
        group: { enrollments: { some: { studentId } } },
        results: { none: { studentId } },
      },
      include: { group: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.homeworkResult.findMany({
      where: { studentId },
      include: { homework: { include: { group: { select: { name: true } } } } },
      orderBy: { homework: { dueDate: "desc" } },
      take: limit,
    }),
  ]);

  return {
    upcoming: upcoming.map((h) => ({
      id: h.id,
      title: h.title,
      dueDate: h.dueDate,
      groupName: h.group.name,
    })),
    checked: checked.map((r) => ({
      id: r.id,
      title: r.homework.title,
      dueDate: r.homework.dueDate,
      groupName: r.homework.group.name,
      status: r.status,
      note: r.note,
    })),
  };
}

// Only children linked to this parent are ever loaded. Returns Map(studentId -> homework data)
export async function listChildrenHomework(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    select: { studentId: true },
  });
  const pairs = await Promise.all(
    links.map(async (l) => [l.studentId, await getStudentHomework(l.studentId)])
  );
  return new Map(pairs);
}
