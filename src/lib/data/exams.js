import { prisma } from "@/lib/prisma";
import { toDbDate } from "@/lib/time";
import { examStats } from "@/lib/grades";
import { notifyExamGrade } from "@/lib/notify";

export async function listExams(groupId = null) {
  const exams = await prisma.exam.findMany({
    where: groupId ? { groupId } : {},
    include: {
      group: { select: { id: true, name: true } },
      results: { select: { score: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return exams.map((e) => ({ ...e, stats: examStats(e.results.map((r) => r.score), e.maxScore) }));
}

export async function createExam({ groupId, title, date, maxScore }) {
  const group = await prisma.studyGroup.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) throw new Error("المجموعة مش موجودة.");

  return prisma.exam.create({ data: { groupId, title, date: toDbDate(date), maxScore } });
}

export function deleteExam(examId) {
  return prisma.exam.deleteMany({ where: { id: examId } });
}

export async function getExamSheet(examId) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
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
  if (!exam) return null;

  const byStudent = new Map(exam.results.map((r) => [r.studentId, r]));
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      date: exam.date,
      maxScore: exam.maxScore,
      groupId: exam.group.id,
      groupName: exam.group.name,
    },
    stats: examStats(exam.results.map((r) => r.score), exam.maxScore),
    students: exam.group.enrollments.map(({ student }) => {
      const result = byStudent.get(student.id);
      return {
        id: student.id,
        name: student.name,
        recorded: Boolean(result),
        absent: result ? result.score === null : false,
        score: result?.score ?? null,
        note: result?.note ?? "",
      };
    }),
  };
}

// entries: [{ studentId, score: number | null, absent: boolean, note }]
//   absent          -> saved with score = null
//   score given     -> saved
//   blank, not absent -> any saved result is removed (not entered yet)
export async function saveExamResults(examId, entries) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { groupId: true, maxScore: true, title: true },
  });
  if (!exam) throw new Error("الاختبار مش موجود.");

  const ids = [...new Set(entries.map((e) => e.studentId))];
  const enrolled = await prisma.enrollment.findMany({
    where: { groupId: exam.groupId, studentId: { in: ids } },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length) throw new Error("فيه طالب مش في المجموعة دي.");

  const ops = [];
  for (const e of entries) {
    const key = { examId_studentId: { examId, studentId: e.studentId } };

    if (e.absent) {
      ops.push(
        prisma.examResult.upsert({
          where: key,
          update: { score: null, note: e.note },
          create: { examId, studentId: e.studentId, score: null, note: e.note },
        })
      );
    } else if (e.score !== null) {
      if (!Number.isFinite(e.score) || e.score < 0 || e.score > exam.maxScore) {
        throw new Error(`الدرجة لازم تكون بين 0 و ${exam.maxScore}.`);
      }
      ops.push(
        prisma.examResult.upsert({
          where: key,
          update: { score: e.score, note: e.note },
          create: { examId, studentId: e.studentId, score: e.score, note: e.note },
        })
      );
    } else {
      ops.push(prisma.examResult.deleteMany({ where: { examId, studentId: e.studentId } }));
    }
  }
  await prisma.$transaction(ops);

  // Notify only the students who actually got a numeric score (not absent, not left blank).
  // notifyExamGrade only ever sends once per (exam, student) - editing a score later won't re-notify.
  const graded = entries.filter((e) => !e.absent && e.score !== null);
  if (graded.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: graded.map((e) => e.studentId) } },
      select: { id: true, name: true, parentPhone: true },
    });
    const studentById = new Map(students.map((s) => [s.id, s]));

    await Promise.allSettled(
      graded.map((e) => {
        const student = studentById.get(e.studentId);
        if (!student) return Promise.resolve();
        return notifyExamGrade({
          studentId: student.id,
          studentPhone: student.parentPhone,
          studentName: student.name,
          examTitle: exam.title,
          score: e.score,
          maxScore: exam.maxScore,
          examId,
        });
      })
    );
  }
}

// A student's exam results, newest first
export async function getStudentExams(studentId, limit = 15) {
  const results = await prisma.examResult.findMany({
    where: { studentId },
    include: { exam: { include: { group: { select: { name: true } } } } },
    orderBy: { exam: { date: "desc" } },
    take: limit,
  });

  return results.map((r) => ({
    id: r.id,
    title: r.exam.title,
    date: r.exam.date,
    groupName: r.exam.group.name,
    maxScore: r.exam.maxScore,
    score: r.score,
    note: r.note,
  }));
}

// Only children linked to this parent are ever loaded. Returns Map(studentId -> exam rows)
export async function listChildrenExams(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    select: { studentId: true },
  });
  const pairs = await Promise.all(
    links.map(async (l) => [l.studentId, await getStudentExams(l.studentId)])
  );
  return new Map(pairs);
}
