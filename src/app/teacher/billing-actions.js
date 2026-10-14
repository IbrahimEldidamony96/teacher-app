"use server";
import { requireRole } from "@/lib/auth";
import { updateEnrollmentFee } from "@/lib/data/groups";
import { recordPayment } from "@/lib/data/payments";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateEnrollmentFeeAction(form) {
  await requireRole("TEACHER");
  const groupId = String(form.get("groupId") ?? "");
  const raw = String(form.get("monthlyFee") ?? "").trim();
  await updateEnrollmentFee(groupId, String(form.get("studentId") ?? ""), raw === "" ? null : Number(raw));
  revalidatePath("/teacher", "layout"); revalidatePath("/dashboard");
  redirect(`/teacher/groups/${encodeURIComponent(groupId)}`);
}

export async function adjustmentAction(form) {
  await requireRole("TEACHER");
  const studentId = String(form.get("studentId") ?? "");
  const kind = String(form.get("kind"));
  if (!["REFUND", "CREDIT"].includes(kind)) throw new Error("نوع التسوية غير صالح.");
  const note = String(form.get("note") ?? "").trim();
  if (!note) throw new Error("اكتب سبب التسوية.");
  await recordPayment({ studentId, kind, month: String(form.get("month")), amount: Number(form.get("amount")), method: String(form.get("method") ?? "OTHER"), note });
  revalidatePath("/teacher", "layout"); revalidatePath("/dashboard");
  redirect(`/teacher/students/${encodeURIComponent(studentId)}`);
}
