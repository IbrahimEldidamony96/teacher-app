import { prisma } from "@/lib/prisma";
import { cairoToday, toDbDate, isValidDateString } from "@/lib/time";
import { notifyHomeworkAssigned } from "@/lib/notify";
import { homeworkState, learningAssert, HOMEWORK_BODY_LIMIT } from "@/lib/learning-policy";
import { removeHomeworkFile } from "@/lib/homework-files";

const attachmentSelect = { id: true, fileName: true, fileMime: true, fileSize: true };
const submissionSelect = { id: true, studentId: true, body: true, fileName: true, fileMime: true, fileSize: true, submittedAt: true, updatedAt: true };

function validateHomework({ title, description, dueDate }) {
  learningAssert(typeof title === "string" && title.trim().length > 0 && title.length <= 200, "اكتب عنوان واجب لا يزيد عن ٢٠٠ حرف.");
  learningAssert(description == null || (typeof description === "string" && description.length <= HOMEWORK_BODY_LIMIT), "تفاصيل الواجب طويلة جداً.");
  learningAssert(isValidDateString(dueDate), "تاريخ التسليم مش مظبوط.");
}

function parentHomeworkWhere(parentId, homeworkId, studentId) {
  return {
    id: homeworkId,
    group: { archivedAt: null, enrollments: { some: { studentId, endedAt: null, student: { archivedAt: null, parents: { some: { parentId } } } } } },
  };
}

export function getParentHomework(parentId, homeworkId, studentId, db = prisma) {
  return db.homework.findFirst({
    where: parentHomeworkWhere(parentId, homeworkId, studentId),
    include: {
      group: { select: { name: true } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      submissions: { where: { studentId }, select: submissionSelect },
      results: { where: { studentId }, select: { status: true } },
    },
  });
}

export async function listHomework(groupId = null) {
  const homework = await prisma.homework.findMany({
    where: groupId ? { groupId } : {},
    include: {
      group: { select: { id: true, name: true, enrollments: { where: { endedAt: null, student: { archivedAt: null } }, select: { studentId: true } }, _count: { select: { enrollments: { where: { endedAt: null, student: { archivedAt: null } } } } } } },
      results: { select: { status: true, studentId: true } },
    },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return homework.map((row) => {
    const active = new Set(row.group.enrollments.map((member) => member.studentId));
    return { ...row, results: row.results.filter((result) => active.has(result.studentId)) };
  });
}

export async function createHomework({ groupId, title, description, dueDate }) {
  validateHomework({ title, description, dueDate });
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    include: { enrollments: { where: { endedAt: null, student: { archivedAt: null } }, include: { student: { select: { id: true, name: true, parentPhone: true } } } } },
  });
  if (!group || group.archivedAt) throw new Error("المجموعة مش موجودة أو مؤرشفة.");

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

export async function updateHomework(homeworkId, { title, description, dueDate }) {
  validateHomework({ title, description, dueDate });
  return prisma.homework.update({ where: { id: homeworkId }, data: { title: title.trim(), description, dueDate: toDbDate(dueDate) } });
}

export async function deleteHomework(homeworkId) {
  const files = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Homework" WHERE "id" = ${homeworkId} FOR UPDATE`;
    const homework = await tx.homework.findUnique({ where: { id: homeworkId }, include: { attachments: { select: { filePath: true } }, submissions: { select: { filePath: true } } } });
    await tx.homework.deleteMany({ where: { id: homeworkId } });
    return homework ? [...homework.attachments, ...homework.submissions].map((row) => row.filePath).filter(Boolean) : [];
  });
  await Promise.all(files.map(removeHomeworkFile));
}

// Everything needed to render one homework's check sheet
export async function getHomeworkSheet(homeworkId) {
  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      results: { include: { student: { select: { name: true } } } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      submissions: { select: { ...submissionSelect, student: { select: { name: true } } } },
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
  if (!homework) return null;

  const byStudent = new Map(homework.results.map((r) => [r.studentId, r]));
  const submissions = new Map(homework.submissions.map((r) => [r.studentId, r]));
  const active = new Set(homework.group.enrollments.map(({ student }) => student.id));
  const historicalIds = new Set([...byStudent.keys(), ...submissions.keys()].filter((id) => !active.has(id)));
  return {
    homework: {
      id: homework.id,
      title: homework.title,
      description: homework.description,
      dueDate: homework.dueDate,
      groupId: homework.group.id,
      groupName: homework.group.name,
      attachments: homework.attachments,
    },
    students: homework.group.enrollments.map(({ student }) => ({
      id: student.id,
      name: student.name,
      status: byStudent.get(student.id)?.status ?? null,
      note: byStudent.get(student.id)?.note ?? "",
      submission: submissions.get(student.id) ?? null,
    })),
    previousStudents: [...historicalIds].map((id) => ({
      id, name: byStudent.get(id)?.student.name ?? submissions.get(id)?.student.name,
      status: byStudent.get(id)?.status ?? null, submission: submissions.get(id) ?? null,
    })),
  };
}

// entries: [{ studentId, status, note }]
export async function saveHomeworkResults(homeworkId, entries) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Homework" WHERE "id" = ${homeworkId} FOR UPDATE`;
    const homework = await tx.homework.findUnique({ where: { id: homeworkId }, select: { groupId: true } });
    if (!homework) throw new Error("الواجب مش موجود.");
    const ids = [...new Set(entries.map((e) => e.studentId))];
    learningAssert(ids.length === entries.length && entries.every((entry) => ["DONE", "PARTIAL", "NOT_DONE"].includes(entry.status)), "حالة الواجب مش مظبوطة.");
    const enrolled = await tx.enrollment.findMany({
      where: { groupId: homework.groupId, studentId: { in: ids }, endedAt: null, student: { archivedAt: null } },
      select: { studentId: true },
    });
    if (enrolled.length !== ids.length) throw new Error("فيه طالب مش في المجموعة دي.");
    for (const e of entries) {
      await tx.homeworkResult.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId: e.studentId } },
        update: { status: e.status, note: e.note },
        create: { homeworkId, studentId: e.studentId, status: e.status, note: e.note },
      });
    }
  });
}

// Upcoming (not yet checked for this student) and the latest checked homework
export async function getStudentHomework(studentId, limit = 10) {
  const today = cairoToday();

  const [upcoming, checked] = await Promise.all([
    prisma.homework.findMany({
      where: {
        group: { archivedAt: null, enrollments: { some: { studentId, endedAt: null, student: { archivedAt: null } } } },
        results: { none: { studentId } },
      },
      include: { group: { select: { name: true } }, attachments: { select: attachmentSelect }, submissions: { where: { studentId }, select: submissionSelect } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.homeworkResult.findMany({
      where: { studentId },
      include: { homework: { include: { group: { select: { name: true } } } } },
      orderBy: { homework: { dueDate: "desc" } },
      take: limit,
    }),
  ]);

  const pending = upcoming.map((h) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      dueDate: h.dueDate,
      groupName: h.group.name,
      attachments: h.attachments,
      state: homeworkState(h, today, h.submissions[0]),
      submission: h.submissions[0] ?? null,
    }));
  return {
    upcoming: pending.filter((h) => h.state === "PENDING"),
    overdue: pending.filter((h) => h.state === "OVERDUE"),
    submitted: pending.filter((h) => h.state === "SUBMITTED"),
    checked: checked.map((r) => ({
      id: r.id,
      homeworkId: r.homeworkId,
      title: r.homework.title,
      description: r.homework.description,
      dueDate: r.homework.dueDate,
      groupName: r.homework.group.name,
      status: r.status,
      note: r.note,
    })),
  };
}

// Called only after authentication; parent identity comes from the session, never the form.
// Recheck both the parent link and group membership while saving the submission.
export async function submitParentHomework(user, homeworkId, studentId, { body, file = null, removeFile = false }) {
  learningAssert(user?.role === "PARENT", "غير مسموح.", 403);
  learningAssert(typeof body === "string" && body.length <= HOMEWORK_BODY_LIMIT, "الإجابة طويلة جداً.");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Homework" WHERE "id" = ${homeworkId} FOR UPDATE`;
    const homework = await getParentHomework(user.id, homeworkId, studentId, tx);
    learningAssert(homework, "الواجب غير متاح لهذا الطالب.", 404);
    learningAssert(homework.results.length === 0, "الواجب اتراجع بالفعل؛ كلّم المدرس لو محتاج تعدّل التسليم.", 409);
    const existing = await tx.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId } } });
    const retained = !file && !removeFile ? existing?.filePath : null;
    learningAssert(body.trim() || file || retained, "اكتب إجابة أو ارفع ملفاً.");
    const data = {
      body: body.trim() || null,
      ...(file ? { filePath: file.path, fileName: file.name, fileMime: file.mime, fileSize: file.size }
        : removeFile ? { filePath: null, fileName: null, fileMime: null, fileSize: null } : {}),
    };
    const submission = await tx.homeworkSubmission.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      create: { homeworkId, studentId, ...data }, update: data,
      select: submissionSelect,
    });
    return { submission, obsoleteFile: existing?.filePath && (file || removeFile) ? existing.filePath : null };
  });
  if (result.obsoleteFile) await removeHomeworkFile(result.obsoleteFile);
  return result.submission;
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
