"use client";

import { useActionState } from "react";
import { updateExamAction } from "@/app/teacher/learning-actions";
import { input, button } from "@/app/teacher/ui";

export default function EditExamForm({ exam }) {
  const [state, action, pending] = useActionState(updateExamAction, {});
  return (
    <details className="ui-panel">
      <summary className="cursor-pointer font-semibold">تعديل تفاصيل الاختبار</summary>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input name="examId" type="hidden" value={exam.id} />
        <label className="flex flex-col gap-1 text-sm">العنوان<input name="title" defaultValue={exam.title} maxLength={200} required className={input} disabled={pending} /></label>
        <label className="flex flex-col gap-1 text-sm">التاريخ<input type="date" name="date" defaultValue={exam.date.toISOString().slice(0, 10)} required className={input} disabled={pending} /></label>
        <label className="flex flex-col gap-1 text-sm">الدرجة الكاملة<input type="number" name="maxScore" min="0.5" step="0.5" defaultValue={exam.maxScore} required className={`${input} w-28`} disabled={pending} /></label>
        <button type="submit" className={button} disabled={pending}>{pending ? "جاري الحفظ..." : "حفظ التفاصيل"}</button>
        <p className="w-full text-xs text-gray-500">لا يمكن تقليل الدرجة الكاملة عن أي درجة مسجلة بالفعل.</p>
        {state.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
        {state.success && <p role="status" className="w-full text-sm text-green-600">{state.success}</p>}
      </form>
    </details>
  );
}
