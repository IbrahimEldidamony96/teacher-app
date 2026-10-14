import { prisma } from "@/lib/prisma";
import { DAY_ORDER, formatRange } from "@/lib/labels";
import { cairoToday, toDbDate, weekdayOf } from "@/lib/time";
import { dateKey, overlappingLessons, resolveScheduleForDate, scheduleDates, validateExceptionInput, validateSlotTimes } from "@/lib/schedule";

const groupSelect = { select: {
  id: true,
  name: true,
  gradeLevel: true,
  _count: { select: { enrollments: { where: { endedAt: null, student: { archivedAt: null } } } } },
} };
const slotOrder = [{ day: "asc" }, { startTime: "asc" }];
const activeGroup = { group: { archivedAt: null } };

export function listAllSlots() {
  return prisma.weeklySlot.findMany({ where: activeGroup, include: { group: groupSelect }, orderBy: slotOrder });
}

function exceptionRange(from, to) {
  return { OR: [
    { date: { gte: toDbDate(from), ...(to ? { lte: toDbDate(to) } : {}) } },
    { replacementDate: { gte: toDbDate(from), ...(to ? { lte: toDbDate(to) } : {}) } },
  ] };
}

export function listScheduleExceptions(from = cairoToday(), to) {
  return prisma.scheduleException.findMany({
    where: { ...activeGroup, ...exceptionRange(from, to) },
    include: { group: groupSelect, slot: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

export async function listSlotsForDate(date) {
  const [slots, exceptions] = await Promise.all([listAllSlots(), listScheduleExceptions(date, date)]);
  return resolveScheduleForDate(slots, exceptions, date);
}

// Keep the existing weekday argument for callers; dated exceptions use Cairo's calendar date.
export function getTodaySlots(_day, date = cairoToday()) {
  return listSlotsForDate(date);
}

// Full student-specific schedule, including one-off cancellations and makeup lessons.
export async function getStudentSchedule(studentId, from = cairoToday()) {
  const dates = scheduleDates(from, 14);
  const groupLinks = await prisma.enrollment.findMany({
    where: { studentId, endedAt: null, student: { archivedAt: null }, group: { archivedAt: null } },
    select: { groupId: true },
  });
  const groupIds = groupLinks.map(row => row.groupId);
  if (!groupIds.length) return { slots: [], exceptions: [], upcomingSlots: [] };
  const [slots, exceptions] = await Promise.all([
    prisma.weeklySlot.findMany({
      where: { groupId: { in: groupIds } },
      include: { group: groupSelect },
      orderBy: slotOrder,
    }),
    prisma.scheduleException.findMany({
      where: { groupId: { in: groupIds }, ...exceptionRange(from, dates.at(-1)) },
      include: { group: groupSelect, slot: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { slots, exceptions, upcomingSlots: dates.flatMap(date => resolveScheduleForDate(slots, exceptions, date)) };
}

// Serializes all schedule writes across requests/processes: there is one tutor.
async function scheduleTransaction(write) {
  return prisma.$transaction(async (tx) => {
    await lockSchedule(tx);
    return write(tx);
  }, { timeout: 15_000 });
}

export async function lockSchedule(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(734209)`;
}

function requireId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 100) throw new Error("اختار المجموعة أو الحصة المطلوبة.");
}

async function requireActiveGroup(tx, groupId) {
  requireId(groupId);
  const group = await tx.studyGroup.findFirst({ where: { id: groupId, archivedAt: null } });
  if (!group) throw new Error("المجموعة غير موجودة أو مؤرشفة.");
  return group;
}

function assertNoClash(slots, date) {
  const clash = overlappingLessons(slots);
  if (clash) {
    const [first, second] = clash;
    throw new Error(`تعارض بين ${first.group.name} و${second.group.name}${date ? ` يوم ${date}` : ""}: ${formatRange(first.startTime, first.endTime)}.`);
  }
}

export async function validateSchedule(tx) {
  const today = cairoToday();
  const [slots, exceptions] = await Promise.all([
    tx.weeklySlot.findMany({ where: activeGroup, include: { group: groupSelect } }),
    tx.scheduleException.findMany({ where: { ...activeGroup, ...exceptionRange(today) }, include: { group: groupSelect } }),
  ]);
  // Check the unlimited recurring week, then every date with an exception.
  for (const day of DAY_ORDER) assertNoClash(slots.filter((slot) => slot.day === day));
  const dates = new Set([today]);
  for (const row of exceptions) {
    if (dateKey(row.date) >= today) dates.add(dateKey(row.date));
    if (row.replacementDate && dateKey(row.replacementDate) >= today) dates.add(dateKey(row.replacementDate));
  }
  for (const date of dates) assertNoClash(resolveScheduleForDate(slots, exceptions, date), date);
}

function validateWeeklyInput(input) {
  if (!DAY_ORDER.includes(input.day)) throw new Error("اختار يوم الحصة.");
  validateSlotTimes(input);
  if ((input.location?.length ?? 0) > 200) throw new Error("المكان أطول من المسموح.");
}

export async function addSlot({ groupId, day, startTime, endTime, location }) {
  validateWeeklyInput({ day, startTime, endTime, location });
  return scheduleTransaction(async (tx) => {
    await requireActiveGroup(tx, groupId);
    const slot = await tx.weeklySlot.create({ data: { groupId, day, startTime, endTime, location: location || null } });
    await validateSchedule(tx);
    return slot;
  });
}

export async function updateSlot(slotId, { day, startTime, endTime, location }) {
  requireId(slotId);
  validateWeeklyInput({ day, startTime, endTime, location });
  return scheduleTransaction(async (tx) => {
    const slot = await tx.weeklySlot.findFirst({ where: { id: slotId, ...activeGroup } });
    if (!slot) throw new Error("الحصة غير موجودة.");
    if (slot.day !== day && await tx.scheduleException.findFirst({ where: { slotId, date: { gte: toDbDate(cairoToday()) } } })) {
      throw new Error("الحصة لها تعديلات قادمة. احذف تعديلات الحصة أولًا قبل تغيير يومها الأسبوعي.");
    }
    const updated = await tx.weeklySlot.update({ where: { id: slotId }, data: { day, startTime, endTime, location: location || null } });
    await validateSchedule(tx);
    return updated;
  });
}

export function deleteSlot(slotId) {
  requireId(slotId);
  return scheduleTransaction(async (tx) => {
    const deleted = await tx.weeklySlot.deleteMany({ where: { id: slotId, ...activeGroup } });
    await validateSchedule(tx);
    return deleted;
  });
}

export async function createScheduleException(input) {
  validateExceptionInput(input, cairoToday());
  return scheduleTransaction(async (tx) => {
    await requireActiveGroup(tx, input.groupId);
    if (input.slotId) {
      const slot = await tx.weeklySlot.findFirst({ where: { id: input.slotId, groupId: input.groupId } });
      if (!slot || slot.day !== weekdayOf(input.date)) throw new Error("الحصة المختارة لا تقع في هذا التاريخ أو لا تنتمي للمجموعة.");
      if (await tx.scheduleException.findFirst({ where: { slotId: input.slotId, date: toDbDate(input.date) } })) {
        throw new Error("الحصة في هذا التاريخ لها تعديل بالفعل. احذف التعديل السابق أولًا.");
      }
    }
    const targetDate = input.kind === "RESCHEDULE" ? input.replacementDate : input.date;
    const holiday = await tx.scheduleException.findFirst({ where: { groupId: input.groupId, kind: "HOLIDAY", date: toDbDate(targetDate) } });
    if (holiday) throw new Error("التاريخ إجازة لهذه المجموعة. احذف الإجازة أولًا.");
    if (input.kind === "HOLIDAY") {
      const changedLesson = await tx.scheduleException.findFirst({ where: {
        groupId: input.groupId,
        OR: [ { kind: "MAKEUP", date: toDbDate(input.date) }, { kind: "RESCHEDULE", replacementDate: toDbDate(input.date) } ],
      } });
      if (changedLesson) throw new Error("اليوم فيه حصة تعويضية أو منقولة. احذفها أولًا قبل تسجيل الإجازة.");
    }
    const hasTimes = ["MAKEUP", "RESCHEDULE"].includes(input.kind);
    const created = await tx.scheduleException.create({ data: {
      groupId: input.groupId,
      slotId: input.slotId || null,
      date: toDbDate(input.date),
      kind: input.kind,
      replacementDate: input.kind === "RESCHEDULE" ? toDbDate(input.replacementDate) : null,
      startTime: hasTimes ? input.startTime : null,
      endTime: hasTimes ? input.endTime : null,
      location: hasTimes ? input.location || null : null,
      reason: input.reason || null,
    } });
    await validateSchedule(tx);
    return created;
  });
}

export function deleteScheduleException(id) {
  requireId(id);
  return scheduleTransaction(async (tx) => {
    const exception = await tx.scheduleException.findFirst({ where: { id, ...activeGroup } });
    if (!exception) throw new Error("التعديل غير موجود.");
    // Deleting a cancellation may restore a lesson, so check the resulting calendar.
    await tx.scheduleException.delete({ where: { id } });
    await validateSchedule(tx);
    return { deleted: true };
  });
}
