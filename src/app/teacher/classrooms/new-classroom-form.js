"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { button, input } from "@/app/teacher/ui";

export default function NewClassroomForm({ groups, today }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/classrooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(values)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "تعذر إنشاء الجلسة.");
      router.push(`/teacher/classrooms/${result.id}`);
      router.refresh();
    } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="ui-form space-y-4">
      <h2 className="font-semibold">إنشاء حصة بالفيديو</h2>
      <div className="ui-form-fields flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">عنوان الحصة<input name="title" required maxLength={160} className={input} disabled={busy} /></label>
        <label className="flex flex-col gap-1 text-sm">المجموعة<select name="groupId" required className={input} disabled={busy}><option value="">اختار المجموعة</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">نوع الفيديو<select name="mode" defaultValue="LIVE" className={input} disabled={busy}><option value="LIVE">بث مباشر بالكاميرا</option><option value="RECORDING">رفع فيديو مسجل</option></select></label>
        <label className="flex flex-col gap-1 text-sm">تاريخ الحضور<input name="date" type="date" required defaultValue={today} max={today} className={input} disabled={busy} /></label>
        <button className={button} disabled={busy || !groups.length}>{busy ? "جاري الإنشاء..." : "إنشاء الجلسة"}</button>
      </div>
      {!groups.length && <p className="text-sm text-gray-500">أنشئ مجموعة وضيف طلابها أولاً.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
