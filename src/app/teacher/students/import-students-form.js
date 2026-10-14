"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { importStudentsAction } from "@/app/teacher/student-actions";
import { STUDENT_CSV_TEMPLATE } from "@/lib/student-csv";
import { GRADE_LABELS } from "@/lib/labels";
import { input, button } from "@/app/teacher/ui";

export default function ImportStudentsForm({ groups }) {
  const [state, action, pending] = useActionState(importStudentsAction, { message: "" });
  const [changed, setChanged] = useState(false);
  const [source, setSource] = useState("");
  const [groupId, setGroupId] = useState("");
  const ready = state.preview && !changed && state.source === source && state.groupId === groupId && state.rows.every((row) => !row.errors.length);
  async function selectFile(event) {
    setChanged(true);
    const file = event.target.files?.[0];
    if (file) setSource(await file.text());
  }
  return <details className="ui-panel">
    <summary className="cursor-pointer font-medium">استيراد الطلاب من ملف CSV</summary>
    <p className="mt-3 text-sm text-gray-500">احفظ الجدول بصيغة CSV UTF-8. مطلوب name وgradeLevel. ممكن تضيف studentPhone وnotes. الصف الدراسي بالكود زي PRIMARY_1 أو باسم الصف العربي. الحد 500 طالب. الطلاب المسجلين بالفعل بيتم تخطيهم بدون تغيير بياناتهم أو مجموعاتهم.</p>
    <a download="students-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + STUDENT_CSV_TEMPLATE)}`} className="my-2 inline-block text-sm underline">تحميل نموذج CSV</a>
    <form action={action} className="ui-form space-y-3" aria-busy={pending} onSubmit={() => setChanged(false)}>
      <label className="flex flex-col gap-1 text-sm">ملف CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">بيانات CSV<textarea name="source" dir="ltr" rows={5} required value={source} onChange={(event) => { setSource(event.target.value); setChanged(true); }} className={`${input} w-full font-mono`} /></label>
      <label className="flex flex-col gap-1 text-sm">إضافة الطلاب الجدد لمجموعة (اختياري)<select name="groupId" value={groupId} onChange={(event) => { setGroupId(event.target.value); setChanged(true); }} className={input}><option value="">بدون مجموعة</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <div className="flex gap-3"><button name="intent" value="preview" disabled={pending} className="ui-button-secondary">{pending ? "جاري المراجعة..." : "معاينة والتحقق"}</button><button name="intent" value="import" disabled={pending || !ready} className={button}>تأكيد الاستيراد</button></div>
      {state.message && <p role="status" className={`text-sm ${state.success ? "text-green-600" : "text-red-600"}`}>{state.message}</p>}
    </form>
    {state.preview && !changed && <div className="mt-4 overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr><th className="p-2">الصف</th><th className="p-2">الاسم</th><th className="p-2">الصف الدراسي</th><th className="p-2">الحالة</th></tr></thead><tbody>{state.rows.map((row) => <tr key={row.row} className="border-t border-gray-200"><td className="p-2">{row.row}</td><td className="p-2">{row.name}</td><td className="p-2">{GRADE_LABELS[row.gradeLevel] ?? "غير صحيح"}</td><td className="p-2">{row.errors.length ? <span className="text-red-600">{row.errors.join(" ")}</span> : row.existingStudentId ? <Link className="underline" href={`/teacher/students/${row.existingStudentId}`}>{row.existingArchived ? "مسجل ومؤرشف — هيتم تخطيه" : "مسجل بالفعل — هيتم تخطيه"}</Link> : "طالب جديد"}</td></tr>)}</tbody></table></div>}
  </details>;
}
