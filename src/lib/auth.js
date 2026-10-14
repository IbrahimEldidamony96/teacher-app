import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Students are not authorized just because Clerk authenticated them.
// The teacher must first set their verified sign-in email on one Student row.
export const getCurrentUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { studentProfile: { select: { id: true, archivedAt: true, loginEmail: true } } },
  });
  if (existing?.role === "TEACHER") {
    const clerkUser = await currentUser();
    const primary = clerkUser?.primaryEmailAddress;
    const email = primary?.emailAddress?.trim().toLowerCase();
    const teacherEmail = (process.env.TEACHER_EMAIL ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
    return email && primary.verification?.status === "verified" && email === teacherEmail ? existing : null;
  }

  const clerkUser = await currentUser();
  const primary = clerkUser?.primaryEmailAddress;
  const email = primary?.emailAddress?.trim().toLowerCase();
  if (!email || primary.verification?.status !== "verified") return null;

  const teacherEmail = (process.env.TEACHER_EMAIL ?? process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  if (!existing && teacherEmail && email === teacherEmail) {
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;
    try {
      return await prisma.user.create({ data: { clerkId: userId, email, name, role: "TEACHER" } });
    } catch {
      return prisma.user.findUnique({ where: { clerkId: userId } });
    }
  }

  const allowed = await prisma.student.findUnique({
    where: { loginEmail: email },
    select: { id: true, userId: true, archivedAt: true },
  });
  if (!allowed || allowed.archivedAt || (allowed.userId && allowed.userId !== existing?.id)) return null;
  if (existing?.studentProfile && existing.studentProfile.id !== allowed.id) return null;

  // Serializes first-login claims on the student row. Unique userId prevents
  // linking one account to multiple student records.
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${allowed.id} FOR UPDATE`;
      const student = await tx.student.findUnique({ where: { id: allowed.id } });
      const user = await tx.user.findUnique({ where: { clerkId: userId } });
      if (!student || student.archivedAt || student.loginEmail !== email || (student.userId && student.userId !== user?.id)) return null;
      if (user?.role === "TEACHER") return null;

      let account = user;
      if (!account) {
        const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;
        account = await tx.user.create({ data: { clerkId: userId, email, name, role: "STUDENT" } });
      } else if (account.role !== "STUDENT" || account.email !== email) {
        account = await tx.user.update({ where: { id: account.id }, data: { role: "STUDENT", email } });
      }
      const other = await tx.student.findFirst({ where: { userId: account.id, id: { not: student.id } }, select: { id: true } });
      if (other) return null;
      if (student.userId !== account.id) {
        await tx.student.update({ where: { id: student.id }, data: { userId: account.id } });
      }
      return { ...account, studentProfile: { id: student.id, archivedAt: null, loginEmail: email } };
    });
  } catch {
    // Another account claimed this email or the student row changed in flight.
    return null;
  }
});

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const user = await getCurrentUser();
  if (!user) redirect("/account-pending");
  return user;
}

export async function requireRole(...roles) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
