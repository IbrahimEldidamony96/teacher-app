"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { input, button } from "@/app/teacher/ui";
import { HOMEWORK_FILE_LIMIT, HOMEWORK_BODY_LIMIT } from "@/lib/learning-policy";

export default function HomeworkSubmissionForm({ homeworkId, studentId, submission }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (file?.size > HOMEWORK_FILE_LIMIT) return setError("حجم الملف أكبر من ١٠ ميجابايت.");
    setBusy(true);
    try {
      const response = await fetch(`/api/homework/${homeworkId}/submissions?student=${encodeURIComponent(studentId)}`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ التسليم.");
      setSaved(true);
      router.refresh();
    } catch (failure) { setError(failure.message || "تعذر حفظ التسليم. أعد المحاولة."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="ui-form space-y-4">
      <label className="flex flex-col gap-2 text-sm">
        الإجابة أو ملاحظات التسليم
        <textarea name="body" rows={5} maxLength={HOMEWORK_BODY_LIMIT} defaultValue={submission?.body ?? ""} disabled={busy} className={input} />
      </label>
      {submission?.fileName && <div className="space-y-2 text-sm">
        <a className="text-blue-600 underline" href={`/api/homework/${homeworkId}/submissions/${studentId}/file`}>{submission.fileName}</a>
        <label className="flex items-center gap-2"><input type="checkbox" name="removeFile" disabled={busy} />حذف الملف الحالي عند الحفظ</label>
      </div>}
      <label className="flex flex-col gap-2 text-sm">
        {submission?.fileName ? "استبدال الملف (اختياري)" : "ملف الإجابة (اختياري)"}
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" disabled={busy} className={input} />
        <span className="text-xs text-gray-500">PDF أو صورة JPG أو PNG أو WebP، حتى ١٠ ميجابايت. اكتب إجابة أو أرفق ملفاً.</span>
      </label>
      <button type="submit" className={button} disabled={busy}>{busy ? "جاري حفظ التسليم..." : submission ? "تحديث التسليم" : "تسليم الواجب"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-600">اتحفظ التسليم. المدرس يقدر يراجعه.</p>}
    </form>
  );
}
