"use client";

import { useRef, useState } from "react";
import { summarizeHeadcounts } from "@/lib/classroom-policy";
import { button } from "@/app/teacher/ui";

function waitForVideo(video, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("تعذر قراءة الفيديو.")), 30_000);
    const finish = (error) => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("المتصفح لا يستطيع قراءة هذا الفيديو."));
    video.addEventListener(event, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

export default function ClassroomHeadcount({ videoRef, videoUrl, enabled, count, samples, save }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const active = useRef(false);

  async function analyze() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setProgress("جاري تجهيز تحليل الفيديو...");
    let worker;
    let id = 0;
    let fileVideo;
    const ask = (message, transfer = []) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => finish(new Error("استغرق تحليل الفيديو وقتاً طويلاً. أعد المحاولة.")), 60_000);
      const finish = (error, data) => {
        clearTimeout(timer);
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", failed);
        if (error) reject(error); else resolve(data);
      };
      const receive = ({ data }) => {
        if (data.id === requestId) finish(data.error ? new Error(data.error) : null, data);
      };
      const failed = () => finish(new Error("تعذر تجهيز تحليل الفيديو. أعد المحاولة."));
      worker.addEventListener("message", receive);
      worker.addEventListener("error", failed);
      worker.postMessage({ ...message, id: requestId }, transfer);
    });
    try {
      worker = new Worker("/headcount-worker.js");
      await ask({ type: "init" });
      let video = videoRef.current;
      if (videoUrl) {
        fileVideo = document.createElement("video");
        fileVideo.preload = "auto";
        fileVideo.muted = true;
        const loaded = waitForVideo(fileVideo, "loadeddata");
        fileVideo.src = videoUrl;
        fileVideo.load();
        await loaded;
        video = fileVideo;
      }
      if (!video || video.readyState < 2) throw new Error("ابدأ الفيديو أولاً ثم أعد المحاولة.");
      const counts = [];
      const total = videoUrl ? 12 : 6;
      for (let index = 0; index < total; index += 1) {
        setProgress(`جاري تحليل اللقطة ${index + 1} من ${total}...`);
        if (fileVideo && Number.isFinite(fileVideo.duration) && fileVideo.duration > 0) {
          const time = fileVideo.duration * (index + 0.5) / total;
          if (Math.abs(fileVideo.currentTime - time) > 0.01) {
            const sought = waitForVideo(fileVideo, "seeked");
            fileVideo.currentTime = time;
            await sought;
          }
        } else if (index) await new Promise((resolve) => setTimeout(resolve, 800));
        const frame = await createImageBitmap(video);
        const result = await ask({ type: "frame", frame }, [frame]);
        counts.push(result.count);
      }
      const result = summarizeHeadcounts(counts);
      if (!result) throw new Error("تعذر تقدير العدد.");
      await save({ action: "estimate", count: result.peak, samples: result.samples });
      setSummary(result);
      setProgress("");
    } catch (failure) {
      setError(failure.message);
      setProgress("");
    } finally {
      worker?.terminate();
      if (fileVideo) { fileVideo.removeAttribute("src"); fileVideo.load(); }
      active.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-300 p-4">
      <h2 className="font-semibold">تقدير العدد الظاهر في الفيديو</h2>
      <p className="text-sm text-gray-500">التحليل يجري على جهازك. العدد تقديري للأشخاص داخل إطار الكاميرا؛ راجع قائمة الطلاب لتأكيد الحضور.</p>
      <button type="button" disabled={!enabled || busy} onClick={analyze} className={button}>
        {busy ? "جاري التحليل..." : "تقدير العدد من الفيديو"}
      </button>
      {progress && <p role="status" className="text-sm text-blue-600">{progress}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {(summary || count != null) && <p data-testid="headcount-result" className="text-sm">
        أعلى عدد ظاهر: <strong>{summary?.peak ?? count}</strong>
        {summary && <> · العدد المعتاد: {summary.typical}</>}
        {" "}· عدد اللقطات: {summary?.samples ?? samples}
      </p>}
    </section>
  );
}
