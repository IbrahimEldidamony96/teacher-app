import { prisma } from "@/lib/prisma";
import { toDbDate, isValidDateString } from "@/lib/time";
import { examStats } from "@/lib/grades";
import { notifyExamGrade } from "@/lib/notify";
import { learningAssert } from "@/lib/learning-policy";

function validateExam({ title, date, maxScore }) {
  learningAssert(typeof title === "string" && title.trim().length > 0 && title.length <= 200, "اكتب عنوان اختبار لا يزيد عن ٢٠٠ حرف.");
  learningAssert(isValidDateString(date), "تاريخ الاختبار مش مظبوط.");
  learningAssert(Number.isFinite(maxScore) && maxScore > 0, "الدرجة الكاملة لازم تكون أكبر من صفر.");
}

export async function listExams(groupId = null) {
  const exams = await prisma.exam.findMany({
    where: groupId ? { groupId } : {},
    include: {
      group: { select: { id: true, name: true, enrollments: { where: { endedAt: null, student: { archivedAt: null } }, select: { studentId: true } } } },
      results: { select: { score: true, studentId: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return exams.map((e) => {
    const active = new Set(e.group.enrollments.map((member) => member.studentId));
    return { ...e, stats: examStats(e.results.filter((r) => active.has(r.studentId)).map((r) => r.score), e.maxScore) };
  });
}

export async function createExam({ groupId, title, date, maxScore }) {
  validateExam({ title, date, maxScore });
  const group = await prisma.studyGroup.findUnique({ where: { id: groupId }, select: { id: true, archivedAt: true } });
  if (!group || group.archivedAt) throw new Error("المجموعة مش موجودة أو مؤرشفة.");

  return prisma.exam.create({ data: { groupId, title, date: toDbDate(date), maxScore } });
}

export async function updateExam(examId, { title, date, maxScore }) {
  validateExam({ title, date, maxScore });
  return prisma.$transaction(async (tx) => {
    // The same row lock is held when grades are saved, so a concurrent grade
    // cannot exceed a newly reduced maximum.
    const rows = await tx.$queryRaw`SELECT "id" FROM "Exam" WHERE "id" = ${examId} FOR UPDATE`;
    learningAssert(rows.length > 0, "الاختبار مش موجود.", 404);
    const scores = await tx.examResult.aggregate({ where: { examId }, _max: { score: true } });
    learningAssert(scores._max.score == null || maxScore >= scores._max.score, `الدرجة الكاملة أقل من درجة مسجلة (${scores._max.score}). عدّل الدرجات الأول.`);
    return tx.exam.update({ where: { id: examId }, data: { title: title.trim(), date: toDbDate(date), maxScore } });
  });
}

export function deleteExam(examId) {
  return prisma.exam.deleteMany({ where: { id: examId } });
}

export async function getExamSheet(examId) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      results: { include: { student: { select: { name: true } } } },
      group: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: { endedAt: null, student: { archivedAt: null } },
            select: { student: { select: { id: true, name: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
    },
  });
  if (!exam) return null;

  const byStudent = new Map(exam.results.map((r) => [r.studentId, r]));
  const active = new Set(exam.group.enrollments.map(({ student }) => student.id));
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      date: exam.date,
      maxScore: exam.maxScore,
      groupId: exam.group.id,
      groupName: exam.group.name,
    },
    stats: examStats(exam.results.filter((r) => active.has(r.studentId)).map((r) => r.score), exam.maxScore),
    previousStudents: exam.results.filter((r) => !active.has(r.studentId)).map((r) => ({ id: r.studentId, name: r.student.name, score: r.score })),
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
  const exam = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Exam" WHERE "id" = ${examId} FOR UPDATE`;
    const exam = await tx.exam.findUnique({
    where: { id: examId },
    select: { groupId: true, maxScore: true, title: true },
  });
  if (!exam) throw new Error("الاختبار مش موجود.");

  const ids = [...new Set(entries.map((e) => e.studentId))];
  learningAssert(ids.length === entries.length, "الطالب مكرر في قائمة الدرجات.");
  const enrolled = await tx.enrollment.findMany({
    where: { groupId: exam.groupId, studentId: { in: ids }, endedAt: null, student: { archivedAt: null } },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length) throw new Error("فيه طالب مش في المجموعة دي.");

  for (const e of entries) {
    const key = { examId_studentId: { examId, studentId: e.studentId } };

    if (e.absent) {
      await tx.examResult.upsert({
          where: key,
          update: { score: null, note: e.note },
          create: { examId, studentId: e.studentId, score: null, note: e.note },
      });
    } else if (e.score !== null) {
      if (!Number.isFinite(e.score) || e.score < 0 || e.score > exam.maxScore) {
        throw new Error(`الدرجة لازم تكون بين 0 و ${exam.maxScore}.`);
      }
      await tx.examResult.upsert({
          where: key,
          update: { score: e.score, note: e.note },
          create: { examId, studentId: e.studentId, score: e.score, note: e.note },
      });
    } else {
      await tx.examResult.deleteMany({ where: { examId, studentId: e.studentId } });
    }
  }
    return exam;
  });

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
