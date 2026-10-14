"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { addSlot, updateSlot, deleteSlot, createScheduleException, deleteScheduleException } from "@/lib/data/timetable";

function field(formData, key) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredId(formData, key) {
  const id = field(formData, key);
  if (!id || id.length > 100) throw new Error("اختار المجموعة أو الحصة المطلوبة.");
  return id;
}

function weeklyFields(formData) {
  return {
    day: field(formData, "day"),
    startTime: field(formData, "startTime"),
    endTime: field(formData, "endTime"),
    location: field(formData, "location"),
  };
}

async function mutate(write) {
  await requireRole("TEACHER");
  try {
    await write();
    revalidatePath("/teacher", "layout");
    revalidatePath("/dashboard");
    return { message: "تم حفظ التغيير.", error: false };
  } catch (error) {
    return { message: error?.code ? "تعذر حفظ التغيير. حاول مرة أخرى." : error.message, error: true };
  }
}

export async function addWeeklySlotAction(_state, formData) {
  return mutate(() => addSlot({ groupId: requiredId(formData, "groupId"), ...weeklyFields(formData) }));
}

export async function updateWeeklySlotAction(_state, formData) {
  return mutate(() => updateSlot(requiredId(formData, "slotId"), weeklyFields(formData)));
}

export async function deleteWeeklySlotAction(_state, formData) {
  return mutate(() => deleteSlot(requiredId(formData, "slotId")));
}

export async function createExceptionAction(_state, formData) {
  return mutate(() => createScheduleException({
    groupId: requiredId(formData, "groupId"),
    kind: field(formData, "kind"),
    slotId: field(formData, "slotId"),
    date: field(formData, "date"),
    replacementDate: field(formData, "replacementDate"),
    startTime: field(formData, "startTime"),
    endTime: field(formData, "endTime"),
    location: field(formData, "location"),
    reason: field(formData, "reason"),
  }));
}

export async function deleteExceptionAction(_state, formData) {
  return mutate(() => deleteScheduleException(requiredId(formData, "exceptionId")));
}
