import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { once } from "node:events";
import { parse } from "dotenv";
import { chromium, expect } from "@playwright/test";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { availablePorts, isolatedDatabase } from "./isolated-database.mjs";

// Temporary visual validation. All app records live in disposable PostgreSQL.
const readEnv = async (name) => parse(await readFile(name, "utf8").catch(() => ""));
const env = { ...await readEnv(".env"), ...await readEnv(".env.local"), ...process.env };
assert.ok(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"), "Development Clerk publishable key required.");
assert.ok(env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Development Clerk secret key required.");
assert.ok(env.TEACHER_EMAIL, "An existing development teacher is required.");
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_PUBLISHABLE_KEY = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
const output = path.resolve(".codex/style-preview");
await mkdir(output, { recursive: true });
const issues = [];
const checks = [];
let database, prisma, server, browser, teacherPage;
let serverLog = "";
const redact = (value) => String(value)
  .replaceAll(env.TEACHER_EMAIL, "[teacher email]")
  .replace(/(?:sk_test_|pk_test_)[a-zA-Z0-9_-]+/g, "[redacted key]")
  .replace(/(token|ticket|__clerk_testing_token)=[^\s'"<>]+/gi, "$1=[redacted]");
const monitor = (page) => page.on("pageerror", (error) => issues.push(redact(error.message)));
try {
  await clerkSetup({ dotenv: false });
  database = await isolatedDatabase("style-preview");
  process.env.DATABASE_URL = database.connectionString;
  process.env.CLASSROOM_INVITE_SECRET = randomBytes(48).toString("base64url");
  process.env.WHATSAPP_ACCESS_TOKEN = "";
  ({ prisma } = await import("../src/lib/prisma.js"));
  const [port] = await availablePorts(1);
  const baseURL = `http://localhost:${port}`;
  process.env.CLASSROOM_PUBLIC_URL = baseURL;
  server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "localhost", "--port", String(port)], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, ...process.env, NODE_ENV: "production", DATABASE_URL: database.connectionString, WHATSAPP_ACCESS_TOKEN: "", CLASSROOM_PUBLIC_URL: baseURL },
  });
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", (chunk) => { serverLog = (serverLog + chunk.toString()).slice(-12000); });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (server.exitCode != null) throw new Error("Visual test server exited before startup.");
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* Starting server. */ }
    if (attempt === 89) throw new Error("Visual test server did not start.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "msedge", headless: true });
  const viewports = [
    { name: "desktop", size: { width: 1440, height: 1000 } },
    { name: "mobile", size: { width: 390, height: 844 } },
  ];
  const noOverflow = async (page, name) => {
    const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    assert.ok(widths.content <= widths.viewport + 1, `${name}: horizontal overflow ${widths.content} > ${widths.viewport}`);
    checks.push(`${name}: no horizontal overflow`);
  };
  const capture = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    await noOverflow(page, name);
    console.log(`CAPTURE: ${name}`);
  };
  const publicContext = await browser.newContext({ baseURL });
  const publicPage = await publicContext.newPage();
  monitor(publicPage);
  for (const viewport of viewports) {
    await publicPage.setViewportSize(viewport.size);
    await publicPage.goto("/", { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByRole("heading", { level: 1 })).toBeVisible();
    await capture(publicPage, `landing-${viewport.name}`);
  }
  await publicPage.setViewportSize(viewports[1].size);
  await setupClerkTestingToken({ page: publicPage });
  for (const route of ["sign-in", "sign-up"]) {
    await publicPage.goto(`/${route}`, { waitUntil: "domcontentloaded" });
    await expect(publicPage.locator("[data-clerk-component], .cl-rootBox").first()).toBeVisible({ timeout: 30000 });
    await capture(publicPage, `${route}-mobile`);
  }
  await publicContext.close();
  const teacherContext = await browser.newContext({ baseURL, viewport: viewports[0].size });
  teacherPage = await teacherContext.newPage();
  teacherPage.setDefaultTimeout(30000);
  monitor(teacherPage);
  await setupClerkTestingToken({ page: teacherPage });
  await teacherPage.goto("/");
  await clerk.signIn({ page: teacherPage, emailAddress: env.TEACHER_EMAIL });
  const clerkId = await teacherPage.evaluate(() => window.Clerk.user.id);
  const teacher = await prisma.user.upsert({
    where: { clerkId },
    update: { name: "أحمد محمود", role: "TEACHER" },
    create: { clerkId, email: env.TEACHER_EMAIL, name: "أحمد محمود", role: "TEACHER" },
  });
  const now = new Date();
  const dateText = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  const month = dateText.slice(0, 7);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short" }).format(now).toUpperCase();
  const groups = [];
  for (const [name, gradeLevel, monthlyFee] of [
    ["الرياضيات · أولى ابتدائي", "PRIMARY_1", 350],
    ["العربي · تالتة ابتدائي", "PRIMARY_3", 400],
    ["العلوم · تالتة إعدادي", "PREP_3", 500],
  ]) groups.push(await prisma.studyGroup.create({ data: { name, gradeLevel, monthlyFee } }));
  const students = [];
  const names = ["ملك أحمد محمد", "عمر خالد حسين", "يوسف مصطفى علي", "فاطمة محمد حسن", "ليلى أحمد محمود", "مريم عبدالله محمد", "آدم هشام إبراهيم", "سلمى عبدالرحمن محمود"];
  for (let i = 0; i < names.length; i += 1) {
    const group = groups[i % groups.length];
    students.push(await prisma.student.create({ data: { name: names[i], gradeLevel: group.gradeLevel, notes: i === 0 ? "تحتاج متابعة تدريبات القسمة" : null, enrollments: { create: { groupId: group.id } } } }));
  }
  for (let i = 0; i < groups.length; i += 1) {
    await prisma.weeklySlot.create({ data: { groupId: groups[i].id, day, startTime: `${14 + i}:00`, endTime: `${15 + i}:00`, location: "قاعة الدرس" } });
    await prisma.weeklySlot.create({ data: { groupId: groups[i].id, day: "SAT", startTime: `${10 + i}:00`, endTime: `${11 + i}:00`, location: "السنتر · القاعة الرئيسية" } });
  }
  for (let i = 0; i < students.length; i += 1) {
    await prisma.attendanceRecord.create({ data: { studentId: students[i].id, groupId: groups[i % 3].id, date, status: ["PRESENT", "LATE", "ABSENT", "EXCUSED"][i % 4] } });
    if (i % 3 !== 2) await prisma.payment.create({ data: { studentId: students[i].id, groupId: groups[i % 3].id, month, amount: i % 3 === 0 ? groups[i % 3].monthlyFee : 200, method: "CASH" } });
  }
  const homework = await prisma.homework.create({ data: { groupId: groups[0].id, title: "تدريبات الجمع والطرح", description: "حل تدريبات الصفحات ١٢ إلى ١٥", assignedOn: date, dueDate: new Date(date.getTime() + 3 * 86400000) } });
  const exam = await prisma.exam.create({ data: { groupId: groups[0].id, title: "تقييم الوحدة الأولى", date, maxScore: 20 } });
  for (const [index, student] of students.filter((_, index) => index % 3 === 0).entries()) {
    await prisma.homeworkResult.create({ data: { homeworkId: homework.id, studentId: student.id, status: index === 0 ? "DONE" : "PARTIAL" } });
    await prisma.examResult.create({ data: { examId: exam.id, studentId: student.id, score: 18 - index * 2 } });
  }
  const session = await prisma.classroomSession.create({ data: { ownerId: teacher.id, groupId: groups[0].id, title: "مراجعة الرياضيات · الوحدة الأولى", mode: "LIVE", status: "DRAFT", attendanceDate: date, participants: { create: students.filter((_, index) => index % 3 === 0).map((student) => ({ studentId: student.id })) } } });
  const routes = [
    ["dashboard", "/dashboard", "/dashboard"],
    ["groups", "/teacher/groups", "/teacher/groups"],
    ["students", "/teacher/students", "/teacher/students"],
    ["payments", "/teacher/payments", "/teacher/payments"],
    ["attendance", "/teacher/attendance", "/teacher/attendance"],
    ["classrooms", "/teacher/classrooms", "/teacher/classrooms"],
    ["schedule", "/teacher/schedule", "/teacher/schedule"],
    ["homework", "/teacher/homework", "/teacher/homework"],
    ["exams", "/teacher/exams", "/teacher/exams"],
  ];
  for (const viewport of viewports) {
    await teacherPage.setViewportSize(viewport.size);
    for (const [name, route, activeHref] of routes) {
      await teacherPage.goto(route, { waitUntil: "domcontentloaded" });
      await expect(teacherPage.locator("main h1")).toBeVisible();
      await expect(teacherPage.locator('nav a[aria-current="page"]')).toHaveAttribute("href", activeHref);
      await capture(teacherPage, `${name}-${viewport.name}`);
    }
  }
  const details = [
    ["student-detail", `/teacher/students/${students[0].id}`],
    ["group-detail", `/teacher/groups/${groups[0].id}`],
    ["attendance-detail", `/teacher/attendance/${groups[0].id}`],
    ["homework-detail", `/teacher/homework/${homework.id}`],
    ["exam-detail", `/teacher/exams/${exam.id}`],
    ["classroom-detail", `/teacher/classrooms/${session.id}`],
  ];
  for (const [name, route] of details) {
    await teacherPage.goto(route, { waitUntil: "domcontentloaded" });
    await expect(teacherPage.locator("main h1")).toBeVisible();
    await capture(teacherPage, `${name}-mobile`);
  }
  await teacherPage.setViewportSize(viewports[0].size);
  await teacherPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(teacherPage.locator("main h1")).toBeVisible();
  await teacherPage.keyboard.press("Tab");
  assert.equal(await teacherPage.evaluate(() => document.activeElement?.getAttribute("href")), "#main-content", "First keyboard stop must be the skip link.");
  await teacherPage.keyboard.press("Enter");
  assert.equal(await teacherPage.evaluate(() => document.activeElement?.id), "main-content", "Skip link must focus the main content.");
  checks.push("Keyboard skip link moves focus to main content");
  await teacherPage.emulateMedia({ reducedMotion: "reduce" });
  await teacherPage.goto("/teacher/students", { waitUntil: "domcontentloaded" });
  await expect(teacherPage.locator("main h1")).toBeVisible();
  const motion = await teacherPage.evaluate(() => [...document.querySelectorAll("main > div, .ui-button, .ui-progress-fill")].map((node) => {
    const styles = getComputedStyle(node);
    return { animation: styles.animationDuration, transition: styles.transitionDuration };
  }));
  const durationSeconds = (value) => value.split(",").map((item) => item.trim().endsWith("ms") ? parseFloat(item) / 1000 : parseFloat(item));
  assert.ok(motion.every((row) => [...durationSeconds(row.animation), ...durationSeconds(row.transition)].every((value) => value <= 0.00002)), `Reduced motion durations were not removed: ${JSON.stringify(motion)}`);
  checks.push("Reduced motion disables entry and control animations");
  await teacherPage.emulateMedia({ reducedMotion: "no-preference" });
  await prisma.parentStudent.create({ data: { parentId: teacher.id, studentId: students[0].id } });
  await prisma.user.update({ where: { id: teacher.id }, data: { role: "PARENT", name: "ولي أمر ملك" } });
  for (const viewport of viewports) {
    await teacherPage.setViewportSize(viewport.size);
    await teacherPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(teacherPage.locator("main h1")).toBeVisible();
    await expect(teacherPage.locator("nav a")).toHaveCount(1);
    await capture(teacherPage, `parent-dashboard-${viewport.name}`);
  }
  assert.equal(issues.length, 0, `Browser runtime errors: ${issues.join("; ")}`);
  checks.push("No browser runtime errors across all captured pages");
  await writeFile(path.join(output, "report.json"), JSON.stringify({ passed: true, checks, screenshots: output, issues }, null, 2));
  console.log(`PASS: ${checks.length} visual/accessibility checks. Screenshots: ${output}`);
} catch (error) {
  console.error(redact(error.stack ?? error.message));
  console.error("Sanitized test server log:", redact(serverLog).slice(-4000));
  await writeFile(path.join(output, "report.json"), JSON.stringify({ passed: false, checks, issues, error: redact(error.message) }, null, 2));
  process.exitCode = 1;
} finally {
  if (teacherPage && !teacherPage.isClosed()) await clerk.signOut({ page: teacherPage }).catch(() => {});
  await browser?.close();
  if (server && server.exitCode == null) {
    server.kill();
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  await prisma?.$disconnect();
  await database?.server.close();
}
