"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { updateStudentAction } from "@/app/teacher/student-actions";
import { GRADE_LABELS, GRADE_ORDER } from "@/lib/labels";
import { input, button } from "@/app/teacher/ui";

export default function StudentEditForm({ student }) {
  const [state, action, pending] = useActionState(updateStudentAction, { message: "" });
  const [values, setValues] = useState({ name: student.name, gradeLevel: student.gradeLevel, parentPhone: student.parentPhone ?? "", notes: student.notes ?? "" });
  function change(event) { setValues((current) => ({ ...current, [event.target.name]: event.target.value })); }
  return <details className="ui-panel">
    <summary className="cursor-pointer font-medium">تعديل بيانات الطالب</summary>
    <form action={action} aria-busy={pending} className="ui-form mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="studentId" value={student.id} />
      <label className="flex flex-col gap-1 text-sm">اسم الطالب<input name="name" maxLength={150} required value={values.name} onChange={change} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">الصف الدراسي<select name="gradeLevel" value={values.gradeLevel} onChange={change} className={input}>{GRADE_ORDER.map((grade) => <option key={grade} value={grade}>{GRADE_LABELS[grade]}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">رقم ولي الأمر<input name="parentPhone" type="tel" dir="ltr" value={values.parentPhone} onChange={change} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">ملاحظات<textarea name="notes" maxLength={2000} value={values.notes} onChange={change} className={input} /></label>
      <button disabled={pending} className={button}>{pending ? "جاري الحفظ..." : "حفظ البيانات"}</button>
      {state.message && <div role="status" className={`w-full text-sm ${state.success ? "text-green-600" : "text-red-600"}`}><p>{state.message}</p>{state.existingStudentId && <Link href={`/teacher/students/${state.existingStudentId}`} className="underline">عرض الطالب المسجل</Link>}</div>}
    </form>
  </details>;
}
