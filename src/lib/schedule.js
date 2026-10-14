import { isValidDateString, toDbDate, weekdayOf } from "./time.js";

export const SCHEDULE_EXCEPTION_KINDS = ["CANCEL", "RESCHEDULE", "MAKEUP", "HOLIDAY"];
export const SCHEDULE_EXCEPTION_LABELS = {
  CANCEL: "إلغاء حصة",
  RESCHEDULE: "نقل حصة",
  MAKEUP: "حصة تعويضية",
  HOLIDAY: "إجازة للمجموعة",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function dateKey(value) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function scheduleDates(from, count = 14) {
  if (!isValidDateString(from) || !Number.isInteger(count) || count < 1 || count > 366) {
    throw new Error("الفترة المطلوبة غير صحيحة.");
  }
  return Array.from({ length: count }, (_, index) => {
    const date = toDbDate(from);
    date.setUTCDate(date.getUTCDate() + index);
    return dateKey(date);
  });
}

export function validateSlotTimes({ startTime, endTime }) {
  if (!TIME.test(startTime ?? "") || !TIME.test(endTime ?? "") || startTime >= endTime) {
    throw new Error("وقت نهاية الحصة لازم يكون بعد البداية، والوقت بصيغة ساعة ودقيقة.");
  }
}

// Calendar dates refer to the day in Cairo; @db.Date uses UTC midnight.
// Recurring rows remain intact when an individual occurrence is changed.
export function resolveScheduleForDate(slots, exceptions, date) {
  if (!isValidDateString(date)) throw new Error("التاريخ غير صحيح.");
  const holidays = new Set(
    exceptions.filter((row) => row.kind === "HOLIDAY" && dateKey(row.date) === date).map((row) => row.groupId)
  );
  const skipped = new Set(
    exceptions
      .filter((row) => ["CANCEL", "RESCHEDULE"].includes(row.kind) && dateKey(row.date) === date)
      .map((row) => row.slotId)
  );
  const day = weekdayOf(date);
  const recurring = slots
    .filter((slot) => slot.day === day && !skipped.has(slot.id) && !holidays.has(slot.groupId))
    .map((slot) => ({ ...slot, id: `${slot.id}@${date}`, slotId: slot.id, date, kind: "WEEKLY" }));

  const changed = exceptions
    .filter((row) => !holidays.has(row.groupId) && (
      (row.kind === "MAKEUP" && dateKey(row.date) === date) ||
      (row.kind === "RESCHEDULE" && row.replacementDate && dateKey(row.replacementDate) === date)
    ))
    .map((row) => ({
      id: `${row.id}@${date}`,
      exceptionId: row.id,
      slotId: row.slotId,
      groupId: row.groupId,
      group: row.group,
      date,
      day,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location,
      reason: row.reason,
      kind: row.kind,
    }));
  return [...recurring, ...changed].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// Half-open intervals: the next lesson may start when the previous one ends.
export function overlappingLessons(slots) {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startTime < sorted[index - 1].endTime) {
      return [sorted[index - 1], sorted[index]];
    }
  }
  return null;
}

export function validateExceptionInput(input, today) {
  if (!SCHEDULE_EXCEPTION_KINDS.includes(input.kind)) throw new Error("اختار نوع تعديل الحصة.");
  if (!isValidDateString(input.date) || input.date < today) throw new Error("اختار تاريخ النهاردة أو تاريخ قادم.");
  if (["CANCEL", "RESCHEDULE"].includes(input.kind) && !input.slotId) throw new Error("اختار الحصة الأصلية.");
  if (["MAKEUP", "HOLIDAY"].includes(input.kind) && input.slotId) throw new Error("الحصة التعويضية أو الإجازة لا ترتبط بحصة أسبوعية.");
  if (["MAKEUP", "RESCHEDULE"].includes(input.kind)) validateSlotTimes(input);
  if (input.kind === "RESCHEDULE" && (!isValidDateString(input.replacementDate) || input.replacementDate < today)) {
    throw new Error("اختار تاريخ جديد للنهاردة أو تاريخ قادم.");
  }
  if ((input.location?.length ?? 0) > 200 || (input.reason?.length ?? 0) > 1000) {
    throw new Error("المكان أو السبب أطول من المسموح.");
  }
}
