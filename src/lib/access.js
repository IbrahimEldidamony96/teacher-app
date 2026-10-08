import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Can this user see this student's data (attendance, payments, schedule)?
// Enforce this in every page and server action that reads a student's records.
export async function canViewStudent(user, studentId) {
  if (user.role === "TEACHER") return true;

  if (user.role === "PARENT") {
    const link = await prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId } },
      select: { id: true },
    });
    return Boolean(link);
  }

  return false;
}

export async function assertCanViewStudent(user, studentId) {
  if (!(await canViewStudent(user, studentId))) notFound();
}
