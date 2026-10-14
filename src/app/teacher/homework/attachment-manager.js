"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HOMEWORK_FILE_LIMIT } from "@/lib/learning-policy";
import { input, button } from "@/app/teacher/ui";

export default function AttachmentManager({ homeworkId, attachments }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function request(url, options, message) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch(url, options);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الملف.");
      if (fileRef.current) fileRef.current.value = "";
      setSaved(message);
      router.refresh();
    } catch (failure) { setError(failure.message || "تعذر حفظ الملف. أعد المحاولة."); }
    finally { setBusy(false); }
  }

  function upload(event) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("اختار ملفاً للرفع.");
    if (file.size > HOMEWORK_FILE_LIMIT) return setError("حجم الملف أكبر من ١٠ ميجابايت.");
    const mime = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "");
    return request(`/api/homework/${homeworkId}/attachments`, { method: "POST", headers: { "Content-Type": mime, "X-File-Name": encodeURIComponent(file.name) }, body: file }, "اترفع الملف وبقى متاحاً لأولياء الأمور.");
  }

  return (
    <section className="ui-panel space-y-4">
      <h2 className="font-semibold">ملفات الواجب</h2>
      {attachments.length > 0 && <ul className="space-y-2 text-sm">
        {attachments.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-3">
          <a className="text-blue-600 underline" href={`/api/homework/${homeworkId}/attachments/${file.id}`}>{file.fileName}</a>
          <span className="text-gray-500">{Math.ceil(file.fileSize / 1024)} كيلوبايت</span>
          <button type="button" className="text-red-600 underline" disabled={busy} onClick={() => request(`/api/homework/${homeworkId}/attachments/${file.id}`, { method: "DELETE" }, "اتحذف الملف.")}>حذف الملف</button>
        </li>)}
      </ul>}
      <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">إضافة ملف<input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" required disabled={busy || attachments.length >= 10} className={input} /></label>
        <button type="submit" className={button} disabled={busy || attachments.length >= 10}>{busy ? "جاري الحفظ..." : "رفع الملف"}</button>
      </form>
      <p className="text-xs text-gray-500">حتى عشرة ملفات PDF أو صور JPG أو PNG أو WebP، ١٠ ميجابايت لكل ملف.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-600">{saved}</p>}
    </section>
  );
}
