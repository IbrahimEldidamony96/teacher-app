import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed in production.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const reset = process.argv.includes("--reset");
const DAY = 24 * 60 * 60 * 1000;
const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

// The last `count` dates (UTC midnight, before today) that fall on the given weekday
function recentDates(day, count) {
  const dates = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 1);
  while (dates.length < count) {
    if (d.getUTCDay() === DAY_INDEX[day]) dates.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return dates;
}

async function main() {
  const existing = (await prisma.studyGroup.count()) + (await prisma.student.count());
  if (existing > 0 && !reset) {
    console.log("The database already has data, so nothing was seeded.");
    console.log("To wipe groups, students, attendance and payments and re-seed: npm run db:seed -- --reset");
    return;
  }

  if (reset) {
    // Children first. Real accounts (tutor and students who signed up) are kept.
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.examResult.deleteMany(),
      prisma.exam.deleteMany(),
      prisma.homeworkResult.deleteMany(),
      prisma.homework.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.attendanceRecord.deleteMany(),
      prisma.weeklySlot.deleteMany(),
      prisma.enrollment.deleteMany(),
      prisma.studyGroup.deleteMany(),
      prisma.student.deleteMany(),
      prisma.user.deleteMany({ where: { clerkId: { startsWith: "seed_" } } }),
    ]);
  }

  // Groups
  const primary1 = await prisma.studyGroup.create({
    data: { name: "أولى ابتدائي - السبت", gradeLevel: "PRIMARY_1", monthlyFee: 300 },
  });
  const prep1 = await prisma.studyGroup.create({
    data: { name: "أولى إعدادي - السبت", gradeLevel: "PREP_1", monthlyFee: 400 },
  });
  const prep3 = await prisma.studyGroup.create({
    data: { name: "تالتة إعدادي - الأحد والثلاثاء", gradeLevel: "PREP_3", monthlyFee: 500 },
  });

  // Students
  const mk = (name, gradeLevel, studentPhone) =>
    prisma.student.create({ data: { name, gradeLevel, studentPhone } });

  const adam = await mk("آدم محمود", "PRIMARY_1", "01000000001");
  const laila = await mk("ليلى أحمد", "PRIMARY_1", "01000000002");
  const youssef = await mk("يوسف خالد", "PRIMARY_1", "01000000003");
  const mariam = await mk("مريم سامي", "PREP_1", "01000000004");
  const omar = await mk("عمر حسن", "PREP_1", "01000000005");
  const nour = await mk("نور إبراهيم", "PREP_1", "01000000006");
  const karim = await mk("كريم عادل", "PREP_3", "01000000007");
  const hoda = await mk("هدى مصطفى", "PREP_3", "01000000008");

  const membership = [
    [primary1, [adam, laila, youssef]],
    [prep1, [mariam, omar, nour]],
    [prep3, [karim, hoda]],
  ];
  for (const [group, students] of membership) {
    await prisma.enrollment.createMany({
      data: students.map((s) => ({
        groupId: group.id,
        studentId: s.id,
        // Laila has a discounted fee, to show a per-student override
        monthlyFee: s.id === laila.id ? 250 : null,
      })),
    });
  }

  // Weekly sessions: first-year primary, then first-year prep right after
  const slot = (group, day, startTime, endTime, location) => ({
    groupId: group.id,
    day,
    startTime,
    endTime,
    location,
  });
  await prisma.weeklySlot.createMany({
    data: [
      slot(primary1, "SAT", "16:00", "17:00", "السنتر"),
      slot(prep1, "SAT", "17:15", "18:30", "السنتر"),
      slot(prep3, "SUN", "17:00", "18:30", "السنتر"),
      slot(prep3, "TUE", "17:00", "18:30", "السنتر"),
      slot(primary1, "WED", "16:00", "17:00", "السنتر"),
    ],
  });

  // Placeholder parents (not real logins), linked to a few students
  const parentAdam = await prisma.user.create({
    data: { role: "PARENT", name: "والدة آدم", email: "parent.adam@example.test", clerkId: "seed_parent_adam" },
  });
  const parentMariam = await prisma.user.create({
    data: { role: "PARENT", name: "والد مريم", email: "parent.mariam@example.test", clerkId: "seed_parent_mariam" },
  });
  await prisma.parentStudent.createMany({
    data: [
      { parentId: parentAdam.id, studentId: adam.id },
      { parentId: parentMariam.id, studentId: mariam.id },
    ],
  });

  // Attendance for the last two sessions of each group's first weekly slot
  const attendanceRows = [];
  const sessions = [
    [primary1, "SAT", [adam, laila, youssef]],
    [prep1, "SAT", [mariam, omar, nour]],
    [prep3, "SUN", [karim, hoda]],
  ];
  for (const [group, day, students] of sessions) {
    recentDates(day, 2).forEach((date, i) => {
      students.forEach((s, j) => {
        let status = "PRESENT";
        if (i === 0 && j === 1) status = "ABSENT";
        if (i === 1 && j === 0) status = "LATE";
        attendanceRows.push({ studentId: s.id, groupId: group.id, date, status });
      });
    });
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows });

  // Payments for the current month: some paid in full, one partial, the rest unpaid
  const month = new Date().toISOString().slice(0, 7);
  await prisma.payment.createMany({
    data: [
      { studentId: adam.id, groupId: primary1.id, month, amount: 300, method: "CASH" },
      { studentId: laila.id, groupId: primary1.id, month, amount: 250, method: "WALLET" },
      { studentId: mariam.id, groupId: prep1.id, month, amount: 400, method: "INSTAPAY" },
      { studentId: omar.id, groupId: prep1.id, month, amount: 200, method: "CASH", note: "دفعة أولى" },
      { studentId: karim.id, groupId: prep3.id, month, amount: 500, method: "CASH" },
    ],
  });

  // Homework: one assigned (not yet checked) and one already checked, per group
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const inThreeDays = new Date(Date.now() + 3 * DAY);
  inThreeDays.setUTCHours(0, 0, 0, 0);

  for (const [group, groupStudents, checkedStatuses] of [
    [primary1, [adam, laila, youssef], ["DONE", "PARTIAL", "NOT_DONE"]],
    [prep1, [mariam, omar, nour], ["DONE", "DONE", "NOT_DONE"]],
    [prep3, [karim, hoda], ["DONE", "DONE"]],
  ]) {
    await prisma.homework.create({
      data: {
        groupId: group.id,
        title: "مراجعة الدرس اللي فات",
        assignedOn: yesterday,
        dueDate: inThreeDays,
      },
    });

    const past = await prisma.homework.create({
      data: {
        groupId: group.id,
        title: "تمارين الوحدة الأولى",
        assignedOn: new Date(Date.now() - 10 * DAY),
        dueDate: new Date(Date.now() - 7 * DAY),
      },
    });
    await prisma.homeworkResult.createMany({
      data: groupStudents.map((s, i) => ({
        homeworkId: past.id,
        studentId: s.id,
        status: checkedStatuses[i],
      })),
    });
  }

  // Exams: one exam per group, fully graded (one absence for prep1)
  const examMath1 = await prisma.exam.create({
    data: { groupId: primary1.id, title: "اختبار الشهر", date: new Date(Date.now() - 5 * DAY), maxScore: 20 },
  });
  await prisma.examResult.createMany({
    data: [
      { examId: examMath1.id, studentId: adam.id, score: 18 },
      { examId: examMath1.id, studentId: laila.id, score: 20 },
      { examId: examMath1.id, studentId: youssef.id, score: 15 },
    ],
  });

  const examPrep1 = await prisma.exam.create({
    data: { groupId: prep1.id, title: "اختبار الشهر", date: new Date(Date.now() - 5 * DAY), maxScore: 30 },
  });
  await prisma.examResult.createMany({
    data: [
      { examId: examPrep1.id, studentId: mariam.id, score: 27 },
      { examId: examPrep1.id, studentId: omar.id, score: null }, // absent
      { examId: examPrep1.id, studentId: nour.id, score: 22 },
    ],
  });

  const examPrep3 = await prisma.exam.create({
    data: { groupId: prep3.id, title: "امتحان نصف الترم", date: new Date(Date.now() - 3 * DAY), maxScore: 50 },
  });
  await prisma.examResult.createMany({
    data: [
      { examId: examPrep3.id, studentId: karim.id, score: 44 },
      { examId: examPrep3.id, studentId: hoda.id, score: 47 },
    ],
  });

  console.log(
    "Seeded: 3 groups, 8 students, weekly sessions, student records, attendance for 2 sessions per group, payments for this month, homework (checked + upcoming), exams with grades."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
