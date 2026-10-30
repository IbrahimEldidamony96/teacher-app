"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLASSROOM_VIDEO_LIMIT } from "@/lib/classroom-policy";
import { button, dangerButton, input } from "@/app/teacher/ui";
import { ClassroomStream, useClassroomMedia } from "@/components/classroom-media";
import ClassroomHeadcount from "@/components/classroom-headcount";
import ClassroomAttendance from "@/components/classroom-attendance";
import ClassroomChat from "@/components/classroom-chat";

const invitationLabels = {
  sent: "اترسلت الدعوة على واتساب",
  already_sent: "الدعوة مُرسلة بالفعل",
  skipped_no_phone: "مفيش رقم واتساب صالح مسجل",
  skipped_not_configured: "إرسال واتساب غير مُفعّل",
  failed: "تعذر إرسال الدعوة؛ تقدر تعيد المحاولة",
};

function connectionUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function responseData(response) {
  const body = await response.json().catch(() => ({ error: "تعذر الاتصال. أعد المحاولة." }));
  if (!response.ok) throw new Error(body.error ?? "تعذر الاتصال. أعد المحاولة.");
  return body;
}

export default function ClassroomRoom({ initialState, iceServers, localOnly = false }) {
  const [state, setState] = useState(initialState);
  const [connectionId, setConnectionId] = useState(connectionUuid);
  const generation = useRef(connectionId);
  const [joined, setJoined] = useState(initialState.actor.role === "TEACHER");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [pollProblem, setPollProblem] = useState("");
  const [info, setInfo] = useState("");
  const [inviting, setInviting] = useState(false);
  const invitationBusy = useRef(false);
  const [invitationProgress, setInvitationProgress] = useState(null);
  const [invitationResults, setInvitationResults] = useState({});
  const [micMuted, setMicMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const messageCursor = useRef(initialState.messages.at(-1)?.id ?? 0);
  const signalCursor = useRef(0);
  const queue = useRef(Promise.resolve());
  const alive = useRef(false);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const id = initialState.session.id;
  const teacher = initialState.actor.role === "TEACHER";
  const endpoint = `/api/classrooms/${id}`;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const send = useCallback(async (body) => responseData(await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, connectionId }), signal: AbortSignal.timeout(20_000),
  })), [connectionId, endpoint]);

  const refresh = useCallback(() => {
    const work = queue.current.catch(() => {}).then(async () => {
      const query = new URLSearchParams({ messages: String(messageCursor.current), signals: String(signalCursor.current), connection: connectionId });
      const data = await responseData(await fetch(`${endpoint}?${query}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) }));
      if (!alive.current || generation.current !== connectionId) return data;
      messageCursor.current = Math.max(messageCursor.current, data.messages.at(-1)?.id ?? 0);
      signalCursor.current = Math.max(signalCursor.current, data.signals.at(-1)?.id ?? 0);
      setState((current) => ({ ...data, messages: [...new Map([...current.messages, ...data.messages].map((message) => [message.id, message])).values()].sort((a, b) => a.id - b.id) }));
      return data;
    });
    queue.current = work;
    return work;
  }, [connectionId, endpoint]);

  useEffect(() => {
    if (!joined || initialState.session.status === "ENDED") return;
    let cancelled = false;
    let timer;
    async function poll(first = false) {
      let data;
      try {
        await send({ action: first ? "connect" : "heartbeat" });
        data = await refresh();
        if (!cancelled) setPollProblem("");
      } catch (failure) {
        if (!cancelled) {
          setPollProblem(failure.message);
          try { data = await refresh(); } catch { /* Keep the last view during a connection outage. */ }
        }
      }
      if (!cancelled && data?.session.status !== "ENDED") timer = setTimeout(() => poll(), 3000);
    }
    poll(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [initialState.session.status, joined, refresh, send]);

  const media = useClassroomMedia({
    role: state.actor.role, status: joined && state.connectionCurrent ? state.session.status : "DRAFT",
    peers: state.peers, signals: state.signals, iceServers, send,
  });

  async function action(body) {
    const result = await send(body);
    await refresh();
    return result;
  }

  async function startVideo() {
    setBusy(true);
    setProblem("");
    try {
      if (!await media.startCamera()) return;
      await action({ action: "start" });
      setMicMuted(false);
    } catch (failure) { media.stopCamera(); setProblem(failure.message); }
    finally { setBusy(false); }
  }

  async function shareStudentMedia() {
    setBusy(true);
    setProblem("");
    try {
      if (!await media.startCamera()) return;
      setMicMuted(false);
      setCameraMuted(false);
    } catch (failure) { setProblem(failure.message); }
    finally { setBusy(false); }
  }

  async function endSession() {
    media.stopCamera();
    setBusy(true);
    setProblem("");
    try { await action({ action: "end" }); }
    catch (failure) { setProblem(failure.message); }
    finally { setBusy(false); }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setProblem("اختار فيديو MP4 أو WebM.");
    if (file.size > CLASSROOM_VIDEO_LIMIT) return setProblem("حجم الفيديو أكبر من ١٠٠ ميجابايت.");
    const type = file.type || (/\.webm$/i.test(file.name) ? "video/webm" : /\.mp4$/i.test(file.name) ? "video/mp4" : "");
    if (!["video/mp4", "video/webm"].includes(type)) return setProblem("اختار فيديو MP4 أو WebM.");
    setBusy(true);
    setProblem("");
    try {
      await responseData(await fetch(`${endpoint}/video`, { method: "PUT", headers: { "Content-Type": type, "X-Video-Name": encodeURIComponent(file.name) }, body: file }));
      await refresh();
      setInfo("اترفع الفيديو والجلسة مفتوحة للطلاب.");
    } catch (failure) { setProblem(failure.message); }
    finally { setBusy(false); }
  }

  async function copyInvite(student) {
    try {
      await navigator.clipboard.writeText(new URL(student.invitePath, location.origin).href);
      setInfo(`اتنسخت دعوة ${student.name}.`);
    } catch { setProblem("تعذر النسخ التلقائي. استخدم «نسخ عنوان الرابط» من رابط الدعوة."); }
  }

  async function rotateInvite(student) {
    setBusy(true);
    try { await action({ action: "rotateInvite", participantId: student.id }); setInfo(`اتجددت دعوة ${student.name}، والدعوة القديمة اتقفلت.`); }
    catch (failure) { setProblem(failure.message); }
    finally { setBusy(false); }
  }

  async function inviteGroup() {
    if (invitationBusy.current) return;
    invitationBusy.current = true;
    setInviting(true);
    setProblem("");
    setInfo("");
    setInvitationProgress(null);
    setInvitationResults({});
    const results = [];
    const startedConnection = connectionId;
    try {
      // Refresh enrollment first so students added since the lesson was created are invited.
      const prepared = await action({ action: "prepareInvitations" });
      const roster = prepared.roster;
      if (!roster.length) throw new Error("مفيش طلاب مسجلين في المجموعة حالياً.");
      setInvitationProgress({ completed: 0, total: roster.length });
      for (let offset = 0; offset < roster.length; offset += 5) {
        if (!alive.current) return;
        if (generation.current !== startedConnection) throw new Error("اتغير اتصال الجلسة. أعد إرسال الدعوات من التبويب الحالي.");
        const batch = roster.slice(offset, offset + 5);
        const response = await send({ action: "sendInvitations", studentIds: batch.map((student) => student.studentId) });
        results.push(...response.results);
        setInvitationResults(Object.fromEntries(results.map((result) => [result.studentId, result.status])));
        setInvitationProgress({ completed: results.length, total: roster.length });
      }
      const sent = results.filter((result) => result.status === "sent").length;
      const already = results.filter((result) => result.status === "already_sent").length;
      const missing = results.filter((result) => result.status === "skipped_no_phone").length;
      const failed = results.filter((result) => ["failed", "skipped_not_configured"].includes(result.status)).length;
      setInfo(`اترسلت ${sent} دعوة على واتساب. مُرسلة بالفعل: ${already}. بدون رقم صالح: ${missing}. تعذر الإرسال: ${failed}.`);
      const errors = results.filter((result) => result.status === "failed" && result.error).map((result) => result.error);
      if (errors.length) setProblem([...new Set(errors)].join(" "));
    } catch (failure) {
      setProblem(failure.message);
      if (results.length) setInfo(`تمت محاولة إرسال ${results.length} دعوة. راجع حالة كل طالب؛ إعادة المحاولة تتخطى الدعوات المُرسلة.`);
    } finally {
      invitationBusy.current = false;
      setInviting(false);
    }
  }

  function rejoin() {
    media.stopCamera();
    const next = connectionUuid();
    generation.current = next;
    signalCursor.current = 0;
    setConnectionId(next);
    setState((current) => ({ ...current, signals: [], connectionCurrent: false }));
    setProblem("");
    setPollProblem("");
    setJoined(true);
  }

  async function loadOlder() {
    const before = state.messages[0]?.id;
    if (!before) return false;
    const data = await responseData(await fetch(`${endpoint}?before=${before}`, { cache: "no-store" }));
    setState((current) => ({ ...current, messages: [...new Map([...data.messages, ...current.messages].map((message) => [message.id, message])).values()].sort((a, b) => a.id - b.id) }));
    return data.messages.length === 100;
  }

  const ended = state.session.status === "ENDED";
  const active = joined && state.connectionCurrent && state.session.status === "ACTIVE";
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{state.session.title}</h1>
        <p className="text-sm text-gray-500">{state.session.groupName} · {state.session.date} · {state.session.mode === "LIVE" ? "حصة مباشرة" : "فيديو مسجل"}</p>
        <p className="text-sm">{ended ? "الجلسة انتهت؛ التسجيل والرسائل السابقة متاحة للمراجعة." : state.session.status === "DRAFT" ? "في انتظار بدء الجلسة" : "الجلسة مفتوحة"}</p>
      </header>
      {teacher && localOnly && <p className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-700">التطبيق مفتوح على هذا الجهاز فقط. استخدم رابطاً عاماً آمناً للتطبيق قبل إرسال الدعوات لطلاب على أجهزة أخرى.</p>}
      {!teacher && !joined && !ended && <button className={button} onClick={() => setJoined(true)}>انضمام ومشاهدة الحصة</button>}
      {joined && !ended && <button className="text-xs text-blue-600 underline" disabled={busy || inviting} onClick={rejoin}>إعادة الانضمام</button>}
      {(problem || pollProblem) && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{problem || pollProblem}</p>}
      {media.error && <p role="alert" className="text-sm text-red-600">{media.error}</p>}
      {info && <p role="status" className="text-sm text-green-600">{info}</p>}

      <section className="ui-panel space-y-3">
        <h2 className="font-semibold">{state.session.mode === "LIVE" ? "الفيديو المباشر" : "تسجيل الحصة"}</h2>
        {state.session.mode === "RECORDING" ? (
          state.session.videoUrl ? <video ref={videoRef} src={state.session.videoUrl} controls playsInline preload="metadata" data-testid="recorded-video" className="aspect-video w-full rounded-xl bg-black" />
            : teacher ? <div className="space-y-3">
              <label className="block text-sm">اختار فيديو MP4 أو WebM (حتى ١٠٠ ميجابايت)<input ref={fileRef} type="file" accept="video/mp4,video/webm,.mp4,.webm" className={`${input} mt-2 w-full`} disabled={busy} /></label>
              <button className={button} disabled={busy} onClick={upload}>{busy ? "جاري رفع الفيديو..." : "رفع الفيديو وفتح الجلسة"}</button>
            </div> : <p className="text-sm text-gray-500">المدرس يجهز الفيديو.</p>
        ) : teacher ? <div className="space-y-3">
          {media.localStream && !ended && <ClassroomStream stream={media.localStream} muted videoRef={videoRef} testId="teacher-local-video" />}
          {!ended && <div className="flex flex-wrap gap-3">
            {!media.localStream && <button className={button} disabled={busy} onClick={startVideo}>{busy ? "جاري الفتح..." : state.session.status === "ACTIVE" ? "استئناف البث" : "فتح الكاميرا وبدء البث"}</button>}
            {media.localStream && <button className="ui-button-secondary" onClick={() => { media.toggleMicrophone(); setMicMuted((value) => !value); }}>{micMuted ? "تشغيل الميكروفون" : "كتم الميكروفون"}</button>}
            {media.localStream && active && <button className={button} disabled={busy || inviting} onClick={inviteGroup}>
              {inviting ? "جاري إرسال الدعوات..." : "إرسال دعوات واتساب لكل طلاب المجموعة"}
            </button>}
          </div>}
          {media.localStream && active && <p className="text-xs text-gray-500">كل طالب مسجل في المجموعة يستلم رابط دعوته الخاص على رقم ولي الأمر. الدعوات المُرسلة تُتخطى عند إعادة المحاولة.</p>}
          {invitationProgress && <p role="status" className="text-sm text-blue-600">الدعوات: {invitationProgress.completed} من {invitationProgress.total}{inviting && " · جاري الإرسال"}</p>}
          <p className="text-xs text-gray-500">شغل الكاميرا والميكروفون بعد استعدادك. الطلاب يقدروا يشاركوا الكاميرا والميكروفون معاك بجانب الأسئلة المكتوبة.</p>
          {active && media.remoteStreams.length > 0 && <div className="space-y-3">
            <h3 className="font-semibold">مشاركات الطلاب</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {media.remoteStreams.map((remote) => <figure key={remote.id} className="space-y-1">
                <ClassroomStream stream={remote.stream} testId="teacher-student-video" />
                <figcaption className="text-sm font-medium">{remote.name}</figcaption>
              </figure>)}
            </div>
          </div>}
        </div> : <div className="space-y-3">
          {joined && !ended && media.remoteStreams.map((remote) => <ClassroomStream key={remote.id} stream={remote.stream} testId="student-live-video" />)}
          {(!joined || !media.remoteStreams.length) && <p className="text-sm text-gray-500">{ended ? "البث انتهى." : !joined ? "اضغط انضمام لمشاهدة البث." : state.session.teacherOnline ? "جاري اتصال الفيديو..." : "في انتظار المدرس."}</p>}
          {active && <div className="space-y-3">
            <p className="text-xs text-gray-500">تقدر تشارك الكاميرا والميكروفون مع المدرس. المشاركة بتبدأ بس لما تضغط الزر وتسمح للمتصفح باستخدامهم.</p>
            {media.localStream && <figure className="max-w-sm space-y-1">
              <ClassroomStream stream={media.localStream} muted testId="student-local-video" />
              <figcaption className="text-sm">الكاميرا بتاعتك · {micMuted ? "الميكروفون مكتوم" : "الميكروفون شغال"}{cameraMuted && " · الكاميرا مقفولة"}</figcaption>
            </figure>}
            <div className="flex flex-wrap gap-3">
              {!media.localStream ? <button className={button} disabled={busy} onClick={shareStudentMedia}>{busy ? "جاري الفتح..." : "مشاركة الكاميرا والميكروفون"}</button> : <>
                <button className="ui-button-secondary" aria-pressed={micMuted} onClick={() => { media.toggleMicrophone(); setMicMuted((value) => !value); }}>{micMuted ? "تشغيل الميكروفون" : "كتم الميكروفون"}</button>
                <button className="ui-button-secondary" aria-pressed={cameraMuted} onClick={() => { media.toggleCamera(); setCameraMuted((value) => !value); }}>{cameraMuted ? "تشغيل الكاميرا" : "إيقاف الكاميرا"}</button>
                <button className={dangerButton} onClick={() => media.stopCamera()}>إيقاف المشاركة</button>
              </>}
            </div>
          </div>}
        </div>}
        {teacher && !ended && <button className={dangerButton} disabled={busy} onClick={endSession}>إنهاء الجلسة</button>}
      </section>

      {!teacher && joined && !ended && <button className="ui-button-secondary text-blue-600" disabled={!active} onClick={async () => {
        try { await action({ action: "hand", raised: !state.self?.handRaised }); }
        catch (failure) { setProblem(failure.message); }
      }}>{state.self?.handRaised ? "إنزال اليد" : "رفع اليد لطلب سؤال"}</button>}

      <ClassroomChat messages={state.messages} roster={state.roster} teacher={teacher} active={active} send={action} loadOlder={loadOlder} />

      {teacher && <>
        <ClassroomHeadcount videoRef={videoRef} videoUrl={state.session.videoUrl} enabled={Boolean(state.session.videoUrl || (media.localStream && !ended))}
          count={state.session.headcountEstimate} samples={state.session.headcountSamples} save={action} />
        <ClassroomAttendance roster={state.roster} mode={state.session.mode} date={state.session.date} confirmedAt={state.session.attendanceConfirmedAt} save={action} />
        <section className="ui-panel space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">دعوات الطلاب ({state.roster.length})</h2>
            <button className="text-xs text-blue-600 underline" disabled={busy || inviting} onClick={async () => {
              try { await action({ action: "refreshRoster" }); setInfo("اتحدثت قائمة الطلاب."); }
              catch (failure) { setProblem(failure.message); }
            }}>تحديث قائمة الطلاب</button>
          </div>
          <p className="text-xs text-gray-500">كل دعوة خاصة بطالب واحد. شاركها معه فقط. تجديد الدعوة يلغي الرابط القديم.</p>
          <ul className="divide-y divide-gray-200">
            {state.roster.map((student) => <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-1">
                <span>{student.name}{student.handRaised && " ✋"}</span>
                {invitationResults[student.studentId] && <p className={`text-xs ${["sent", "already_sent"].includes(invitationResults[student.studentId]) ? "text-green-600" : "text-amber-700"}`}>
                  {invitationLabels[invitationResults[student.studentId]]}
                </p>}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-blue-600">
                <button disabled={busy} onClick={() => copyInvite(student)}>نسخ الدعوة</button>
                <a href={student.invitePath} target="_blank" rel="noreferrer">فتح الدعوة</a>
                <button disabled={busy || inviting} onClick={() => rotateInvite(student)}>رابط جديد</button>
              </div>
            </li>)}
          </ul>
        </section>
      </>}
    </div>
  );
}
