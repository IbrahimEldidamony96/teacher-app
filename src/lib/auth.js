import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

// The signed-in user's database record (created on first sign-in), or null.
export const getCurrentUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const primary = clerkUser?.primaryEmailAddress;
  if (!clerkUser || !primary) return null;

  const email = primary.emailAddress.toLowerCase();
  const verified = primary.verification?.status === "verified";
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email;

  // Everyone starts as PARENT (lowest privilege). Only TEACHER_EMAIL becomes the tutor.
  const teacherEmail = (process.env.TEACHER_EMAIL ?? process.env.ADMIN_EMAIL)?.toLowerCase();
  const role = verified && teacherEmail && email === teacherEmail ? "TEACHER" : "PARENT";

  try {
    return await prisma.user.create({ data: { clerkId: userId, email, name, role } });
  } catch {
    // Two requests raced on first sign-in; the other one created the record
    return prisma.user.findUnique({ where: { clerkId: userId } });
  }
});

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await getCurrentUser();
  if (!user) throw new Error("مقدرناش نحمّل حسابك.");
  return user;
}

// Usage: const user = await requireRole("TEACHER");
export async function requireRole(...roles) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
