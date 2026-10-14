"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { updateHomework } from "@/lib/data/homework";
import { updateExam } from "@/lib/data/exams";
import { LearningError } from "@/lib/learning-policy";

function text(formData, key) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function refresh(homework = false) {
  revalidatePath("/teacher", "layout");
  revalidatePath("/dashboard");
  if (homework) revalidatePath("/student/homework", "layout");
}

export async function updateHomeworkAction(_previousState, formData) {
  await requireRole("TEACHER");
  try {
    await updateHomework(text(formData, "homeworkId"), {
      title: text(formData, "title"), description: text(formData, "description") || null, dueDate: text(formData, "dueDate"),
    });
  } catch (error) {
    if (error instanceof LearningError) return { error: error.message };
    if (error?.code === "P2025") return { error: "الواجب مش موجود." };
    throw error;
  }
  refresh(true);
  return { success: "اتحفظت تفاصيل الواجب." };
}

export async function updateExamAction(_previousState, formData) {
  await requireRole("TEACHER");
  try {
    await updateExam(text(formData, "examId"), {
      title: text(formData, "title"), date: text(formData, "date"), maxScore: Number(text(formData, "maxScore")),
    });
  } catch (error) {
    if (error instanceof LearningError) return { error: error.message };
    throw error;
  }
  refresh();
  return { success: "اتحفظت تفاصيل الاختبار." };
}
