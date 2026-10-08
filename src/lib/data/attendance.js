import { prisma } from "@/lib/prisma";
import { toDbDate } from "@/lib/time";
import { getStudentMonthStatus } from "@/lib/data/payments";
import { notifyAbsence, notifyPaymentReminder } from "@/lib/notify";

// Everything needed to render one session's attendance sheet
export async function getSessionAttendance(groupId, dateStr) {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      slots: { select: { day: true } },
      enrollments: {
        select: { student: { select: { id: true, name: true } } },
        orderBy: { student: { name: "asc" } },
      },
    },
  });
  if (!group) return null;

  const records = await prisma.attendanceRecord.findMany({
    where: { groupId, date: toDbDate(dateStr) },
  });
  const byStudent = new Map(records.map((r) => [r.studentId, r]));

  return {
    group: {
      id: group.id,
      name: group.name,
      gradeLevel: group.gradeLevel,
      slotDays: group.slots.map((s) => s.day),
    },
    students: group.enrollments.map(({ student }) => ({
      id: student.id,
      name: student.name,
      status: byStudent.get(student.id)?.status ?? null,
      note: byStudent.get(student.id)?.note ?? "",
    })),
    recorded: records.length > 0,
  };
}

// entries: [{ studentId, status, note }]. Saving again for the same date overwrites.
export async function saveAttendance(groupId, dateStr, entries) {
  const ids = [...new Set(entries.map((e) => e.studentId))];
  const enrolled = await prisma.enrollment.findMany({
    where: { groupId, studentId: { in: ids } },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length) {
    throw new Error("فيه طالب مش في المجموعة دي.");
  }

  const date = toDbDate(dateStr);
  const records = await prisma.$transaction(
    entries.map((e) =>
      prisma.attendanceRecord.upsert({
        where: { studentId_groupId_date: { studentId: e.studentId, groupId, date } },
        update: { status: e.status, note: e.note },
        create: { studentId: e.studentId, groupId, date, status: e.status, note: e.note },
      })
    )
  );

  await sendAttendanceNotifications({ groupId, dateStr, records });
}

// Fires two kinds of WhatsApp notification, neither of which can fail the save:
//  - an absence message for every student marked ABSENT
//  - a once-per-month payment reminder for the session's month, for any student
//    whose subscription for that month isn't fully paid yet
// Missing credentials, a missing phone number, or an API error are all logged and skipped.
async function sendAttendanceNotifications({ groupId, dateStr, records }) {
  const [group, students] = await Promise.all([
    prisma.studyGroup.findUnique({ where: { id: groupId }, select: { name: true } }),
    prisma.student.findMany({
      where: { id: { in: records.map((r) => r.studentId) } },
      select: { id: true, name: true, parentPhone: true },
    }),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const month = dateStr.slice(0, 7);

  await Promise.allSettled(
    records.flatMap((record) => {
      const student = studentById.get(record.studentId);
      if (!student) return [];

      const tasks = [];
      if (record.status === "ABSENT") {
        tasks.push(
          notifyAbsence({
            studentId: student.id,
            studentPhone: student.parentPhone,
            studentName: student.name,
            groupName: group.name,
            date: record.date,
            attendanceRecordId: record.id,
          })
        );
      }
      tasks.push(
        getStudentMonthStatus(student.id, month).then((s) => {
          if (s.status === "PAID") return;
          return notifyPaymentReminder({
            studentId: student.id,
            studentPhone: student.parentPhone,
            studentName: student.name,
            month,
            remaining: s.remaining,
          });
        })
      );
      return tasks;
    })
  );
}

// Map of groupId -> number of attendance records saved on that date
export async function getAttendanceCountsForDate(dateStr) {
  const rows = await prisma.attendanceRecord.groupBy({
    by: ["groupId"],
    where: { date: toDbDate(dateStr) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.groupId, r._count._all]));
}

// Counts, attendance rate (present + late count as attended) and the latest records
export async function getStudentAttendance(studentId, limit = 15) {
  const [grouped, recent] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { studentId },
      include: { group: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: limit,
    }),
  ]);

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  const total = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
  const attended = counts.PRESENT + counts.LATE;

  return {
    counts,
    total,
    rate: total > 0 ? Math.round((attended / total) * 100) : null,
    recent,
  };
}

// Only children linked to this parent are ever loaded
export async function listChildrenAttendance(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    select: { studentId: true },
  });
  return Promise.all(
    links.map(async (l) => [l.studentId, await getStudentAttendance(l.studentId)])
  ).then((pairs) => new Map(pairs));
}
