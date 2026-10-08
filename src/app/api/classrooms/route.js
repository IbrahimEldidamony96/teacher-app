import { getCurrentUser } from "@/lib/auth";
import { createClassroom } from "@/lib/data/classrooms";
import { classroomAssert } from "@/lib/classroom-errors";
import { checkClassroomOrigin, classroomFailure, classroomJson, classroomResponse } from "@/lib/classroom-http";

export async function POST(request) {
  try {
    checkClassroomOrigin(request);
    const user = await getCurrentUser();
    classroomAssert(user?.role === "TEACHER", "غير مسموح.", 403);
    const session = await createClassroom(user, await classroomJson(request));
    return classroomResponse(session, 201);
  } catch (error) {
    return classroomFailure(error);
  }
}
