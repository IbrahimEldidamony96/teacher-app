import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { once } from "node:events";
import { parse } from "dotenv";
import { chromium, expect } from "@playwright/test";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { availablePorts, isolatedDatabase } from "./isolated-database.mjs";

// Explicit opt-in: a production build and existing Clerk DEVELOPMENT teacher
// account are required. Every application write goes to disposable PostgreSQL.
// Each browser has an isolated profile; the temporary teacher session is signed
// out. No teacher passwords, SMS, emails, existing app records, or user browser
// profiles are used. Uploaded test files are removed in the cleanup below.
const env = { ...parse(await readFile(".env.local", "utf8")), ...process.env };
assert.ok(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"), "Browser tests require Clerk development keys.");
assert.ok(env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Browser tests require Clerk development keys.");
assert.ok(env.TEACHER_EMAIL, "Configure the development teacher account first.");
const studentEmails = [env.E2E_STUDENT_EMAIL_1, env.E2E_STUDENT_EMAIL_2];
assert.ok(studentEmails.every(Boolean), "Set E2E_STUDENT_EMAIL_1 and E2E_STUDENT_EMAIL_2 to two verified Clerk development student accounts.");
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
let database, prisma, server, browser, teacherPage;
let serverLog = "";
const issues = [];
const cleanupFiles = [];
function redact(value) {
  return String(value).replaceAll(env.TEACHER_EMAIL, "[teacher email]")
    .replace(/(token|ticket|__clerk_testing_token)=[^\s'"<>]+/gi, "$1=[redacted]")
    .replace(/(?:sk_test_|pk_test_)[a-zA-Z0-9_-]+/g, "[redacted key]");
}
try {
  await clerkSetup({ dotenv: false });
  database = await isolatedDatabase("classroom-browser");
  process.env.DATABASE_URL = database.connectionString;
  process.env.CLASSROOM_INVITE_SECRET = randomBytes(48).toString("base64url");
  process.env.WHATSAPP_ACCESS_TOKEN = "";
  ({ prisma } = await import("../src/lib/prisma.js"));
  const [port] = await availablePorts(1);
  const baseURL = `http://localhost:${port}`;
  server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "localhost", "--port", String(port)], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, ...process.env, NODE_ENV: "production", DATABASE_URL: database.connectionString, WHATSAPP_ACCESS_TOKEN: "" },
  });
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", (chunk) => { serverLog = (serverLog + chunk.toString()).slice(-12_000); });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (server.exitCode != null) throw new Error("Test server exited before becoming ready.");
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* Server startup. */ }
    if (attempt === 89) throw new Error("Test server did not start.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const teacherContext = await browser.newContext({ baseURL, permissions: ["camera", "microphone"], viewport: { width: 1440, height: 1000 } });
  teacherPage = await teacherContext.newPage();
  teacherPage.setDefaultTimeout(30_000);
  teacherPage.on("pageerror", (error) => issues.push(redact(error.message)));
  await setupClerkTestingToken({ page: teacherPage });
  await teacherPage.goto("/");
  await clerk.signIn({ page: teacherPage, emailAddress: env.TEACHER_EMAIL });
  const clerkId = await teacherPage.evaluate(() => window.Clerk.user.id);
  await prisma.user.create({ data: { clerkId, email: env.TEACHER_EMAIL, name: "Browser Test Teacher", role: "TEACHER" } });
  const group = await prisma.studyGroup.create({ data: { name: "Browser Test Class", gradeLevel: "PRIMARY_1", monthlyFee: 0 } });
  const groupStudents = await Promise.all(["Browser Student A", "Browser Student B"].map((name, i) => prisma.student.create({ data: { name, gradeLevel: "PRIMARY_1", loginEmail: studentEmails[i].toLowerCase(), enrollments: { create: { groupId: group.id } } } })));
  const createThroughForm = async (mode, title) => {
    await teacherPage.goto("/teacher/classrooms");
    await teacherPage.getByLabel("عنوان الحصة").fill(title);
    await teacherPage.getByLabel("المجموعة", { exact: true }).selectOption(group.id);
    await teacherPage.getByLabel("نوع الفيديو").selectOption(mode);
    await teacherPage.getByRole("button", { name: "إنشاء الجلسة", exact: true }).click();
    await teacherPage.waitForURL(/\/teacher\/classrooms\/[^/]+$/);
    await expect(teacherPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
    return teacherPage.url().split("/").at(-1);
  };
  const json = async (context, endpoint, body) => {
    const response = await context.request.post(endpoint, { data: body, headers: { Origin: baseURL } });
    assert.ok(response.ok(), `Classroom mutation failed: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const liveId = await createThroughForm("LIVE", "Browser Live Lesson");
  const liveEndpoint = `/api/classrooms/${liveId}`;
  await teacherPage.getByRole("button", { name: "فتح الكاميرا وبدء البث", exact: true }).click();
  await teacherPage.waitForFunction(() => document.querySelector('[data-testid="teacher-local-video"]')?.readyState >= 2);
  await expect(teacherPage.getByText("الجلسة مفتوحة", { exact: true })).toBeVisible();
  const state = await (await teacherContext.request.get(liveEndpoint)).json();
  const studentContexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL })));
  const pages = await Promise.all(studentContexts.map((context) => context.newPage()));
  for (let i = 0; i < pages.length; i += 1) {
    pages[i].setDefaultTimeout(45_000);
    pages[i].on("pageerror", (error) => issues.push(redact(error.message)));
    await setupClerkTestingToken({ page: pages[i] });
    await pages[i].goto("/");
    await clerk.signIn({ page: pages[i], emailAddress: studentEmails[i] });
    const clerkId = await pages[i].evaluate(() => window.Clerk.user.id);
    const account = await prisma.user.create({
      data: { clerkId, email: studentEmails[i].toLowerCase(), name: groupStudents[i].name, role: "STUDENT" },
    });
    await prisma.student.update({ where: { id: groupStudents[i].id }, data: { userId: account.id } });
    await pages[i].goto(state.roster[i].invitePath);
    await pages[i].getByRole("button", { name: "انضمام ومشاهدة الحصة", exact: true }).click();
  }
  for (const page of pages) {
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="student-live-video"]');
      return video?.readyState >= 2 && video.videoWidth > 0;
    }, null, { timeout: 90_000 });
  }
  console.log("PASS: teacher camera broadcasts decoded live video to two separately invited students.");
  await pages[0].getByRole("button", { name: "رفع اليد لطلب سؤال", exact: true }).click();
  await expect(teacherPage.getByText(/رفع يده/).first()).toBeVisible();
  await pages[0].getByLabel("سؤالك للمدرس").fill("Private browser student question");
  await pages[0].getByRole("button", { name: "إرسال للمدرس", exact: true }).click();
  const messages = teacherPage.getByTestId("classroom-messages");
  await expect(messages.getByText("Private browser student question", { exact: true })).toBeVisible();
  assert.equal((await (await studentContexts[1].request.get(liveEndpoint)).json()).messages.length, 0);
  await messages.locator("li").filter({ hasText: "Private browser student question" }).getByRole("button", { name: "رد", exact: true }).click();
  await teacherPage.getByLabel("رسالة المدرس").fill("Private browser teacher reply");
  await teacherPage.getByRole("button", { name: "إرسال الرد", exact: true }).click();
  await expect(pages[0].getByTestId("classroom-messages").getByText("Private browser teacher reply", { exact: true })).toBeVisible();
  await teacherPage.getByLabel("إرسال إلى").selectOption("");
  await teacherPage.getByLabel("رسالة المدرس").fill("Public browser teacher question");
  await teacherPage.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(pages[1].getByTestId("classroom-messages").getByText("Public browser teacher question", { exact: true })).toBeVisible();
  assert.deepEqual((await (await studentContexts[1].request.get(liveEndpoint)).json()).messages.map((row) => row.body), ["Public browser teacher question"]);
  assert.equal(await prisma.attendanceRecord.count(), 0);
  const outsider = await browser.newContext({ baseURL });
  assert.equal((await outsider.request.get(liveEndpoint)).status(), 401);
  assert.equal((await studentContexts[0].request.post(liveEndpoint, { data: { action: "end" }, headers: { Origin: baseURL } })).status(), 403);
  assert.equal((await studentContexts[0].request.post(liveEndpoint, { data: { action: "hand", raised: false }, headers: { Origin: "https://other.example" } })).status(), 403);
  await teacherPage.getByRole("button", { name: "استخدم اقتراح الانضمام", exact: true }).click();
  await teacherPage.getByLabel(`حضور ${state.roster[1].name}`, { exact: true }).selectOption("LATE");
  await expect(teacherPage.getByRole("button", { name: "تأكيد وحفظ الحضور", exact: true })).toBeDisabled();
  await teacherPage.getByRole("checkbox").check();
  await teacherPage.getByRole("button", { name: "تأكيد وحفظ الحضور", exact: true }).click();
  await expect(teacherPage.getByText("اتحفظ الحضور بعد تأكيدك.", { exact: true })).toBeVisible();
  assert.equal(await prisma.attendanceRecord.count(), 2);
  assert.equal(await prisma.attendanceRecord.count({ where: { status: "LATE" } }), 1);
  console.log("PASS: private questions/replies, class questions, hand raising, role checks, CSRF checks, and explicit attendance review.");
  await teacherPage.getByRole("button", { name: "إنهاء الجلسة", exact: true }).click();
  await expect(teacherPage.getByText(/الجلسة انتهت/).first()).toBeVisible();

  // A synthetic, moving WebM verifies upload/playback without recording people.
  const recordingId = await createThroughForm("RECORDING", "Browser Recorded Lesson");
  const videoData = await teacherPage.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    let frame = 0;
    const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? "#102040" : "#204060"; ctx.fillRect(0, 0, 320, 240); }, 60);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    recorder.stop(); await stopped; clearInterval(timer); stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
  });
  await teacherPage.locator('input[type="file"]').setInputFiles({ name: "synthetic-classroom.webm", mimeType: "video/webm", buffer: Buffer.from(videoData) });
  await teacherPage.getByRole("button", { name: "رفع الفيديو وفتح الجلسة", exact: true }).click();
  await expect(teacherPage.getByTestId("recorded-video")).toBeVisible();
  const recordingEndpoint = `/api/classrooms/${recordingId}`;
  const recordingState = await (await teacherContext.request.get(recordingEndpoint)).json();
  const stored = await prisma.classroomSession.findUniqueOrThrow({ where: { id: recordingId } });
  cleanupFiles.push(stored.videoFile);
  await pages[0].goto(recordingState.roster[0].invitePath);
  await pages[0].getByRole("button", { name: "انضمام ومشاهدة الحصة", exact: true }).click();
  await pages[0].getByTestId("recorded-video").evaluate((video) => video.play());
  await pages[0].waitForFunction(() => document.querySelector('[data-testid="recorded-video"]')?.videoWidth === 320);
  const range = await studentContexts[0].request.get(`${recordingEndpoint}/video`, { headers: { Range: "bytes=0-9" } });
  assert.equal(range.status(), 206); assert.equal((await range.body()).length, 10);
  assert.equal((await outsider.request.get(`${recordingEndpoint}/video`)).status(), 401);
  const invalidRange = await studentContexts[0].request.get(`${recordingEndpoint}/video`, { headers: { Range: "bytes=999999999-" } });
  assert.equal(invalidRange.status(), 416);
  assert.equal((await studentContexts[0].cookies()).some((item) => item.name === `classroom_${recordingId}`), false);
  await teacherPage.getByRole("button", { name: "تقدير العدد من الفيديو", exact: true }).click();
  await expect(teacherPage.getByTestId("headcount-result")).toContainText("عدد اللقطات: 12", { timeout: 120_000 });
  assert.equal((await prisma.classroomSession.findUniqueOrThrow({ where: { id: recordingId } })).headcountEstimate, 0);
  await json(teacherContext, recordingEndpoint, { action: "rotateInvite", participantId: recordingState.roster[0].id });
  assert.equal((await studentContexts[0].request.get(recordingEndpoint)).status(), 401);
  assert.equal((await studentContexts[0].request.get(`${recordingEndpoint}/video`)).status(), 401);
  assert.equal(await prisma.attendanceRecord.count(), 2);
  console.log("PASS: private upload and playback, protected byte ranges, local headcount model, invitation revocation, and no automatic attendance.");
  assert.equal(issues.length, 0, `Browser runtime errors: ${issues.join("; ")}`);
  console.log("Classroom browser checks passed using isolated PostgreSQL and temporary Clerk test authentication.");
} catch (error) {
  console.error(redact(error.stack ?? error.message));
  console.error("Sanitized test-server log:", redact(serverLog).slice(-4000));
  process.exitCode = 1;
} finally {
  // Read only from the disposable test database, including files from a failed
  // upload assertion. Delete exactly its UUID filenames inside the private root.
  if (prisma) {
    const files = await prisma.classroomSession.findMany({ where: { videoFile: { not: null } }, select: { videoFile: true } }).catch(() => []);
    cleanupFiles.push(...files.map((row) => row.videoFile));
  }
  if (teacherPage && !teacherPage.isClosed()) await clerk.signOut({ page: teacherPage }).catch(() => {});
  await browser?.close();
  if (server && server.exitCode == null) { server.kill(); await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]); }
  for (const file of new Set(cleanupFiles)) {
    if (!/^[a-f0-9-]{36}\.webm$/.test(file ?? "")) continue;
    const root = path.resolve("private-uploads/classrooms");
    const target = path.resolve(root, file);
    assert.equal(path.dirname(target), root);
    await unlink(target).catch(() => {});
  }
  await prisma?.$disconnect();
  await database?.server.close();
}
