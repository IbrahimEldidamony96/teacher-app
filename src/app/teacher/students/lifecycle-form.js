"use client";

import { useActionState } from "react";
import { groupLifecycleAction, studentLifecycleAction } from "@/app/teacher/student-actions";
import { button, dangerButton } from "@/app/teacher/ui";

export default function LifecycleForm({ recordId, archived, kind = "student" }) {
  const [state, action, pending] = useActionState(kind === "group" ? groupLifecycleAction : studentLifecycleAction, { message: "" });
  const label = kind === "group" ? "المجموعة" : "الطالب";
  const form = <form action={action} aria-busy={pending} className="space-y-2">
    <input type="hidden" name="recordId" value={recordId} />
    <input type="hidden" name="intent" value={archived ? "restore" : "archive"} />
    {!archived && <label className="flex items-start gap-2 text-xs text-gray-500"><input type="checkbox" required />أؤكد إغلاق الاشتراكات النشطة والاحتفاظ بالسجل.</label>}
    <button disabled={pending} className={archived ? button : dangerButton}>{pending ? "جاري الحفظ..." : archived ? `استرجاع ${label}` : `أرشفة ${label}`}</button>
    {state.message && <p role="status" className={`text-xs ${state.success ? "text-green-600" : "text-red-600"}`}>{state.message}</p>}
  </form>;
  if (archived) return <div className="space-y-2"><p className="text-xs text-gray-500">الاسترجاع بيحتفظ بالسجل. التسجيل في المجموعات من جديد.</p>{form}</div>;
  return <details><summary className="cursor-pointer text-sm text-red-600">أرشفة {label}</summary><div className="mt-2">{form}</div></details>;
}
