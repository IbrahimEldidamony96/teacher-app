"use client";

import { useActionState } from "react";
import { updateHomeworkAction } from "@/app/teacher/learning-actions";
import { input, button } from "@/app/teacher/ui";

export default function EditHomeworkForm({ homework }) {
  const [state, action, pending] = useActionState(updateHomeworkAction, {});
  return (
    <details className="ui-panel">
      <summary className="cursor-pointer font-semibold">تعديل تفاصيل الواجب</summary>
      <form action={action} className="mt-4 space-y-4">
        <input name="homeworkId" type="hidden" value={homework.id} />
        <label className="flex flex-col gap-1 text-sm">العنوان<input name="title" defaultValue={homework.title} required maxLength={200} className={input} disabled={pending} /></label>
        <label className="flex flex-col gap-1 text-sm">موعد التسليم<input type="date" name="dueDate" defaultValue={homework.dueDate.toISOString().slice(0, 10)} required className={input} disabled={pending} /></label>
        <label className="flex flex-col gap-1 text-sm">التعليمات<textarea name="description" defaultValue={homework.description ?? ""} maxLength={10000} rows={4} className={input} disabled={pending} /></label>
        <button type="submit" className={button} disabled={pending}>{pending ? "جاري الحفظ..." : "حفظ التفاصيل"}</button>
        {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-green-600">{state.success}</p>}
      </form>
    </details>
  );
}
