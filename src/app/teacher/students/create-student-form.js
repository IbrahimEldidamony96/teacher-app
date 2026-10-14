"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStudentAction } from "@/app/teacher/actions";
import { button, input } from "@/app/teacher/ui";
import { GRADE_LABELS, GRADE_ORDER } from "@/lib/labels";

const initialState = { message: "", existingStudentId: null };

export default function CreateStudentForm({ groups }) {
  const [state, formAction, pending] = useActionState(createStudentAction, initialState);
  const [values, setValues] = useState({
    name: "",
    gradeLevel: GRADE_ORDER[0],
    parentPhone: "",
    groupId: "",
    notes: "",
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="ui-form flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        اسم الطالب
        <input name="name" required value={values.name} onChange={handleChange} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        الصف الدراسي
        <select
          name="gradeLevel"
          required
          value={values.gradeLevel}
          onChange={handleChange}
          className={input}
        >
          {GRADE_ORDER.map((grade) => (
            <option key={grade} value={grade}>
              {GRADE_LABELS[grade]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        رقم ولي الأمر (اختياري)
        <input
          name="parentPhone"
          type="tel"
          dir="ltr"
          placeholder="01xxxxxxxxx"
          value={values.parentPhone}
          onChange={handleChange}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        المجموعة (اختياري)
        <select name="groupId" value={values.groupId} onChange={handleChange} className={input}>
          <option value="">من غير مجموعة</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        ملاحظات (اختياري)
        <input name="notes" value={values.notes} onChange={handleChange} className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "جاري الإضافة..." : "إضافة طالب"}
      </button>
      {state?.message && (
        <div role="alert" aria-live="polite" className="w-full text-sm text-red-600">
          <p>{state.message}</p>
          {state.existingStudentId && (
            <Link
              href={`/teacher/students/${state.existingStudentId}`}
              className="mt-1 inline-block text-blue-600 underline"
            >
              عرض الطالب المسجل
            </Link>
          )}
        </div>
      )}
    </form>
  );
}
