import { requireClassroomActor } from "@/lib/classroom-auth";
import { changeClassroom, confirmClassroomAttendance, getClassroomState } from "@/lib/data/classrooms";
import { prepareClassroomInvitations, sendClassroomInvitations } from "@/lib/data/classroom-invitations";
import { checkClassroomOrigin, classroomFailure, classroomJson, classroomResponse } from "@/lib/classroom-http";
import { classroomAssert } from "@/lib/classroom-errors";

export async function GET(request, { params }) {
  try {
    const { sessionId } = await params;
    const actor = await requireClassroomActor(sessionId);
    const query = new URL(request.url).searchParams;
    const state = await getClassroomState(actor, {
      messageAfter: Number(query.get("messages") ?? 0), messageBefore: Number(query.get("before") ?? 0), signalAfter: Number(query.get("signals") ?? 0),
      connectionId: query.get("connection"),
    });
    return classroomResponse(state);
  } catch (error) {
    return classroomFailure(error);
  }
}

export async function POST(request, { params }) {
  try {
    checkClassroomOrigin(request);
    const { sessionId } = await params;
    const actor = await requireClassroomActor(sessionId);
    const body = await classroomJson(request);
    let result;
    if (body.action === "prepareInvitations" || body.action === "sendInvitations") {
      const input = { ...body, requestOrigin: new URL(request.url).origin };
      result = body.action === "prepareInvitations"
        ? await prepareClassroomInvitations(actor, input)
        : await sendClassroomInvitations(actor, input);
    } else {
      result = body.action === "attendance"
        ? await confirmClassroomAttendance(actor, body)
        : await changeClassroom(actor, body);
    }
    return classroomResponse(result);
  } catch (error) {
    return classroomFailure(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    checkClassroomOrigin(request);
    const { sessionId } = await params;
    const actor = await requireClassroomActor(sessionId);
    classroomAssert(actor.role === "TEACHER", "غير مسموح.", 403);
    return classroomResponse(await changeClassroom(actor, { action: "end" }));
  } catch (error) {
    return classroomFailure(error);
  }
}
