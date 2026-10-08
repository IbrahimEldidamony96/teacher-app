"use client";

import { useState } from "react";
import { ATTENDANCE_LABELS, ATTENDANCE_ORDER } from "@/lib/labels";
import { button, input } from "@/app/teacher/ui";

export default function ClassroomAttendance({ roster, mode, date, save, confirmedAt }) {
  const [choices, setChoices] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  function choose(id, status) {
    setChoices((current) => ({ ...current, [id]: status }));
    setConfirmed(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await save({ action: "attendance", confirmed, entries: roster.map((student) => ({
        studentId: student.studentId, status: choices[student.studentId] ?? student.recordedStatus ?? "",
        note: student.recordedNote || null,
      })) });
      setInfo("اتحفظ الحضور بعد تأكيدك.");
      setConfirmed(false);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-300 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">مراجعة وتأكيد الحضور · {date}</h2>
        {mode === "LIVE" && <button type="button" className="text-sm text-blue-600 underline" onClick={() => {
          setChoices(Object.fromEntries(roster.map((student) => [student.studentId, student.joinedAt ? "PRESENT" : "ABSENT"])));
          setConfirmed(false);
        }}>استخدم اقتراح الانضمام</button>}
      </div>
      <p className="text-sm text-gray-500">راجع كل طالب واختر حالته. نشاط الانضمام والعدد الظاهر في الفيديو يساعدان في المراجعة؛ حفظ الحضور يعتمد على تأكيدك.</p>
      <form onSubmit={submit} className="space-y-4">
        <ul className="divide-y divide-gray-200">
          {roster.map((student) => (
            <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{student.name}</p>
                <p className="text-xs text-gray-500">
                  {student.online ? "متصل الآن" : student.joinedAt ? "انضم سابقاً" : "لم ينضم"}
                  {student.joinedAt && <> · مدة الاتصال المقدرة: {Math.floor(student.attendedSeconds / 60)} دقيقة</>}
                  {student.handRaised && " · رفع يده"}
                </p>
              </div>
              <select aria-label={`حضور ${student.name}`} required className={input}
                value={choices[student.studentId] ?? student.recordedStatus ?? ""}
                onChange={(event) => choose(student.studentId, event.target.value)}>
                <option value="">اختار الحالة</option>
                {ATTENDANCE_ORDER.map((status) => <option key={status} value={status}>{ATTENDANCE_LABELS[status]}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          راجعت قائمة الطلاب وأؤكد اختيارات الحضور
        </label>
        <p className="text-xs text-gray-500">الحفظ يحدث سجل المجموعة لهذا التاريخ، ويرسل إشعارات الغياب والتذكير حسب إعدادات التطبيق.</p>
        <button className={button} disabled={!confirmed || busy || roster.length === 0}>{busy ? "جاري الحفظ..." : "تأكيد وحفظ الحضور"}</button>
        {confirmedAt && !info && <p className="text-sm text-green-600">تم تأكيد الحضور لهذه الجلسة سابقاً.</p>}
        {info && <p role="status" className="text-sm text-green-600">{info}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
