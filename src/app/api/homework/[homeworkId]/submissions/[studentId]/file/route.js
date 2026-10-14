import { prisma } from "@/lib/prisma";
import { learningUser, learningFailure, authorizeHomeworkFile } from "@/lib/learning-http";
import { downloadHomeworkFile } from "@/lib/homework-download";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const user = await learningUser();
    const { homeworkId, studentId } = await params;
    await authorizeHomeworkFile(user, homeworkId, studentId);
    const file = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId } } });
    return await downloadHomeworkFile(file);
  } catch (error) { return learningFailure(error); }
}
