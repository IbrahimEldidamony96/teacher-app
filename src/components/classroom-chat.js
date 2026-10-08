"use client";

import { useState } from "react";
import { button, input } from "@/app/teacher/ui";

export default function ClassroomChat({ messages, roster = [], teacher, active, send, loadOlder }) {
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [kind, setKind] = useState("QUESTION");
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [more, setMore] = useState(true);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send({ action: "message", body, kind: reply ? "REPLY" : kind, recipientId: teacher ? recipient || null : null, replyToId: reply?.id ?? null });
      setBody("");
      setReply(null);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function older() {
    setHistoryBusy(true);
    try { if (!(await loadOlder())) setMore(false); }
    catch (failure) { setError(failure.message); }
    finally { setHistoryBusy(false); }
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-300 p-4">
      <h2 className="font-semibold">الأسئلة والإجابات</h2>
      <p className="text-xs text-gray-500">{teacher ? "اسأل كل المجموعة أو طالباً محدداً، ورد على أسئلة الطلاب." : "أسئلتك وإجاباتك الخاصة تصل للمدرس. أسئلة المدرس للمجموعة تظهر هنا."}</p>
      {messages.length > 0 && more && <button type="button" onClick={older} disabled={historyBusy} className="text-xs text-blue-600 underline">{historyBusy ? "جاري العرض..." : "عرض رسائل أقدم"}</button>}
      <ol aria-label="رسائل الحصة" data-testid="classroom-messages" className="max-h-96 space-y-3 overflow-y-auto">
        {messages.length === 0 && <li className="text-sm text-gray-500">لسه مفيش رسائل. ابدأ بسؤال.</li>}
        {messages.map((message) => (
          <li key={message.id} className="rounded-lg bg-gray-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>{message.senderName}{message.recipientName && ` ← ${message.recipientName}`}{message.isPrivate && " · خاص"}</span>
              <time>{new Date(message.createdAt).toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })}</time>
            </div>
            {message.replyToId && <p className="mt-2 border-r-2 border-blue-300 pr-2 text-xs text-gray-500">رد على: {messages.find((row) => row.id === message.replyToId)?.body.slice(0, 100) ?? "رسالة سابقة"}</p>}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
            {active && <button type="button" onClick={() => {
              setReply(message);
              if (teacher) setRecipient(message.senderId ?? message.recipientId ?? "");
            }} className="mt-2 text-xs text-blue-600 underline">رد</button>}
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="space-y-3">
        {reply && <p className="text-xs text-blue-600">رد على {reply.senderName}: {reply.body.slice(0, 80)} <button type="button" onClick={() => setReply(null)} className="mr-2 underline">إلغاء الرد</button></p>}
        {teacher && <div className="flex flex-wrap gap-2">
          <select aria-label="نوع الرسالة" value={kind} onChange={(event) => setKind(event.target.value)} disabled={!active || busy || Boolean(reply)} className={input}>
            <option value="QUESTION">سؤال</option><option value="ANNOUNCEMENT">رسالة للمجموعة</option>
          </select>
          <select aria-label="إرسال إلى" value={recipient} onChange={(event) => setRecipient(event.target.value)} disabled={!active || busy || Boolean(reply)} className={input}>
            <option value="">كل المجموعة</option>
            {roster.map((student) => <option key={student.id} value={student.id}>{student.name} (خاص)</option>)}
          </select>
        </div>}
        <textarea aria-label={teacher ? "رسالة المدرس" : "سؤالك للمدرس"} value={body} onChange={(event) => setBody(event.target.value)} required maxLength={2000} rows={3} disabled={!active || busy}
          placeholder={active ? (teacher ? "اكتب سؤالك أو ردك..." : "اكتب سؤالك أو إجابتك...") : "تتاح الرسائل عندما تكون الجلسة مفتوحة"} className={`${input} w-full`} />
        <button className={button} disabled={!active || busy || !body.trim()}>{busy ? "جاري الإرسال..." : reply ? "إرسال الرد" : teacher ? "إرسال" : "إرسال للمدرس"}</button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
