import { notFound } from "next/navigation";

// Student authorization must be derived from the signed-in, verified account,
// never from studentId supplied in the URL, request body, or query string.
export async function canViewStudent(user, studentId) {
  if (user?.role === "TEACHER") return true;
  return user?.role === "STUDENT" &&
    user.studentProfile?.id === studentId &&
    !user.studentProfile?.archivedAt;
}

export async function assertCanViewStudent(user, studentId) {
  if (!(await canViewStudent(user, studentId))) notFound();
}
