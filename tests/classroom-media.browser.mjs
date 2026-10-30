import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

// Exercise the real room UI and native WebRTC with fake capture devices. Only
// the classroom HTTP transport is replaced; no accounts or database are needed.
const bundle = await build({
  stdin: {
    contents: `import React from "react";
      import { createRoot } from "react-dom/client";
      import ClassroomRoom from "./src/components/classroom-room.js";
      createRoot(document.getElementById("root")).render(
        <ClassroomRoom initialState={window.initialState} iceServers={[]} />
      );`,
    resolveDir: process.cwd(), loader: "jsx",
  },
  alias: { "@": path.resolve("src") },
  bundle: true, write: false, format: "iife", platform: "browser",
  loader: { ".js": "jsx" }, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const members = [
  { id: "teacher", role: "TEACHER", name: "Test Teacher", connectionId: null },
  { id: "one", role: "STUDENT", name: "Test Student One", connectionId: null },
  { id: "two", role: "STUDENT", name: "Test Student Two", connectionId: null },
];
let status = "DRAFT";
const signals = [];
function stateFor(member, connectionId, signalAfter = 0) {
  const peerId = `${member.id}:${member.connectionId}`;
  return {
    session: {
      id: "media-test", title: "Live media test", groupName: "Test Group",
      date: "2026-10-30", mode: "LIVE", status,
      teacherOnline: Boolean(members[0].connectionId), teacherName: members[0].name,
    },
    actor: { role: member.role, name: member.name, participantId: member.role === "STUDENT" ? member.id : null },
    connectionCurrent: Boolean(connectionId && connectionId === member.connectionId),
    peers: members.filter((other) => other !== member && other.connectionId && (member.role === "TEACHER" || other.role === "TEACHER"))
      .map((other) => ({ id: `${other.id}:${other.connectionId}`, name: other.name })),
    signals: signals.filter((signal) => signal.toPeer === peerId && signal.id > signalAfter),
    messages: [],
    ...(member.role === "TEACHER" ? {
      roster: members.slice(1).map((other) => ({
        id: other.id, studentId: other.id, name: other.name, online: Boolean(other.connectionId),
        attendedSeconds: 0, invitePath: `/${other.id}`, recordedNote: "",
      })),
    } : { self: { handRaised: false } }),
  };
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/bundle.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      return response.end(bundle.outputFiles[0].text);
    }
    const member = members.find((item) => request.headers.cookie?.includes(`actor=${item.id}`));
    if (url.pathname.startsWith("/api/classrooms/")) {
      assert.ok(member);
      response.setHeader("Content-Type", "application/json");
      if (request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const data = JSON.parse(body);
        if (data.action === "connect") member.connectionId = data.connectionId;
        if (data.action === "start") { assert.equal(member.role, "TEACHER"); status = "ACTIVE"; }
        if (data.action === "end") { assert.equal(member.role, "TEACHER"); status = "ENDED"; }
        if (data.action === "signal") signals.push({ id: signals.length + 1, fromPeer: `${member.id}:${data.connectionId}`, toPeer: data.toPeer, payload: data.payload });
        return response.end("{}");
      }
      return response.end(JSON.stringify(stateFor(member, url.searchParams.get("connection"), Number(url.searchParams.get("signals") ?? 0))));
    }
    const selected = members.find((item) => url.pathname === `/${item.id}`);
    if (!selected) { response.writeHead(404); return response.end(); }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": `actor=${selected.id}; Path=/; SameSite=Strict` });
    response.end(`<!doctype html><html lang="ar"><body><div id="root"></div><script>window.initialState=${JSON.stringify(stateFor(selected))}</script><script src="/bundle.js"></script></body></html>`);
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.E2E_BROWSER_CHANNEL || "msedge", headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const errors = [];
  const pages = [];
  for (const member of members) {
    const context = await browser.newContext({ baseURL, permissions: ["camera", "microphone"] });
    await context.addInitScript(() => {
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.testMedia = { streams: [], connections: [], calls: 0 };
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.testMedia.calls += 1;
        if (window.denyCapture) throw new DOMException("Permission denied", "NotAllowedError");
        const stream = await capture(constraints);
        window.testMedia.streams.push(stream);
        if (window.deferCapture) await new Promise((resolve) => { window.resolveCapture = resolve; });
        return stream;
      };
      const PeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends PeerConnection {
        constructor(config) { super(config); window.testMedia.connections.push(this); }
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/${member.id}`);
    pages.push(page);
  }
  const [teacher, first, second] = pages;
  const decoded = async (page, testId, count = 1) => {
    await page.waitForFunction(({ testId, count }) => {
      const videos = [...document.querySelectorAll(`[data-testid="${testId}"]`)];
      return videos.length === count && videos.every((video) => video.readyState >= 2 && video.videoWidth > 0);
    }, { testId, count });
  };
  const noLiveTracks = async (page) => page.waitForFunction(() => window.testMedia.streams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
  await expect(first.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true })).toHaveCount(0);
  await teacher.getByRole("button", { name: "فتح الكاميرا وبدء البث", exact: true }).click();
  for (const student of [first, second]) {
    await student.getByRole("button", { name: "انضمام ومشاهدة الحصة", exact: true }).click();
    await decoded(student, "student-live-video");
    assert.equal(await student.evaluate(() => window.testMedia.calls), 0, "Joining must not capture student devices.");
  }
  console.log("PASS: two students watch the teacher without opening their cameras or microphones.");

  await first.evaluate(() => { window.denyCapture = true; });
  await first.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true }).click();
  await expect(first.getByRole("alert")).toContainText("اسمح باستخدامهما");
  await decoded(first, "student-live-video");
  await first.evaluate(() => { window.denyCapture = false; });
  await Promise.all([first, second].map((student) => student.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true }).click()));
  await decoded(teacher, "teacher-student-video", 2);
  for (const student of [first, second]) {
    await decoded(student, "student-local-video");
    assert.equal(await student.getByTestId("student-local-video").evaluate((video) => video.muted), true);
  }
  await expect(teacher.locator("figure").filter({ hasText: "Test Student One" })).toBeVisible();
  await expect(teacher.locator("figure").filter({ hasText: "Test Student Two" })).toBeVisible();
  await teacher.waitForFunction(() => window.testMedia.connections.length === 2 && window.testMedia.connections.every((pc) => pc.getReceivers().some(({ track }) => track.kind === "audio" && !track.muted)));
  console.log("PASS: both students send decoded camera video and microphone audio to the teacher.");

  await first.getByRole("button", { name: "كتم الميكروفون", exact: true }).click();
  assert.equal(await first.evaluate(() => window.testMedia.streams.at(-1).getAudioTracks()[0].enabled), false);
  await first.getByRole("button", { name: "تشغيل الميكروفون", exact: true }).click();
  assert.equal(await first.evaluate(() => window.testMedia.streams.at(-1).getAudioTracks()[0].enabled), true);
  await first.getByRole("button", { name: "إيقاف الكاميرا", exact: true }).click();
  assert.equal(await first.evaluate(() => window.testMedia.streams.at(-1).getVideoTracks()[0].enabled), false);
  await first.getByRole("button", { name: "تشغيل الكاميرا", exact: true }).click();
  await first.getByRole("button", { name: "إيقاف المشاركة", exact: true }).click();
  await noLiveTracks(first);
  await decoded(teacher, "teacher-student-video", 1);
  await decoded(first, "student-live-video");
  await first.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true }).click();
  await decoded(teacher, "teacher-student-video", 2);
  console.log("PASS: separate camera/microphone controls, stop, and restart preserve the teacher broadcast.");

  await first.getByRole("button", { name: "إعادة الانضمام", exact: true }).click();
  await noLiveTracks(first);
  await decoded(first, "student-live-video");
  await expect(first.getByTestId("student-local-video")).toHaveCount(0);
  await first.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true }).click();
  await decoded(teacher, "teacher-student-video", 2);
  await second.getByRole("button", { name: "إيقاف المشاركة", exact: true }).click();
  await second.evaluate(() => { window.deferCapture = true; });
  await second.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true }).click();
  await second.waitForFunction(() => Boolean(window.resolveCapture));
  await teacher.getByRole("button", { name: "إنهاء الجلسة", exact: true }).click();
  await expect(second.getByText("الجلسة انتهت؛ التسجيل والرسائل السابقة متاحة للمراجعة.", { exact: true })).toBeVisible();
  await second.evaluate(() => window.resolveCapture());
  for (const page of pages) {
    await noLiveTracks(page);
    await page.waitForFunction(() => window.testMedia.connections.every((pc) => pc.signalingState === "closed"));
  }
  await expect(first.getByRole("button", { name: "مشاركة الكاميرا والميكروفون", exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log("PASS: rejoining and ending the lesson release devices, including delayed permission requests.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
