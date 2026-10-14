"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkEnrollStudentsAction } from "@/app/teacher/student-actions";
import { GRADE_LABELS } from "@/lib/labels";
import { input, button, card } from "@/app/teacher/ui";
import LifecycleForm from "./lifecycle-form";

export default function RosterList({ students, groups }) {
  const [selected, setSelected] = useState([]);
  const [state, action, pending] = useActionState(bulkEnrollStudentsAction, { message: "" });
  const active = students.filter((student) => !student.archived);
  const visibleSelection = selected.filter((id) => active.some((student) => student.id === id));
  function toggle(id) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  return <div className="space-y-3">
    {active.length > 0 && <form id="bulk-enrollment" action={action} className="ui-form flex flex-wrap items-end gap-3" aria-busy={pending}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active.every((student) => visibleSelection.includes(student.id))} onChange={(event) => setSelected(event.target.checked ? active.map((student) => student.id) : [])} />تحديد طلاب الصفحة</label>
      <label className="flex flex-col gap-1 text-sm">إضافة المحددين لمجموعة<select name="groupId" required className={input}><option value="">اختار مجموعة</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">اشتراك خاص (اختياري)<input name="monthlyFee" type="number" min="0" max="100000" step="1" className={`${input} w-28`} /></label>
      <button disabled={pending || !visibleSelection.length || !groups.length} className={button}>{pending ? "جاري الإضافة..." : `إضافة ${visibleSelection.length} طالب`}</button>
      {state.message && <p role="status" className={`w-full text-sm ${state.success ? "text-green-600" : "text-red-600"}`}>{state.message}</p>}
    </form>}
    {!students.length ? <p className="ui-empty">مفيش طلاب مطابقين للبحث.</p> : <ul className={card}>{students.map((student) => <li key={student.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-3">{!student.archived && <input type="checkbox" name="studentId" value={student.id} form="bulk-enrollment" aria-label={`تحديد ${student.name}`} checked={visibleSelection.includes(student.id)} onChange={() => toggle(student.id)} />}
        <Link href={`/teacher/students/${student.id}`} className="hover:underline"><span className="font-medium">{student.name}</span><span className="block text-sm text-gray-500">{GRADE_LABELS[student.gradeLevel]} · {student.groups.length ? student.groups.join("، ") : "من غير مجموعة"}{student.linkedAccount && " · حساب الطالب مفعّل"}{student.archived && " · مؤرشف"}</span></Link>
      </div>
      <LifecycleForm recordId={student.id} archived={student.archived} />
    </li>)}</ul>}
  </div>;
}
