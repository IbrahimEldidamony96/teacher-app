import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { actorFromClassroomInvite, getClassroomActor } from "@/lib/classroom-auth";
import { classroomFailure } from "@/lib/classroom-http";
import { classroomRequestOrigin } from "@/lib/classroom-origin";

export async function GET(request, { params }) {
  try {
    const { sessionId } = await params;
    const origin = classroomRequestOrigin(request);
    const tokenActor = await actorFromClassroomInvite(sessionId, new URL(request.url).searchParams.get("token"));
    const { userId } = await auth();
    let path;
    if (!userId) {
      // Sign in with the approved student account. The invite never creates a session.
      path = `/sign-in?redirect_url=${encodeURIComponent(`/classroom/${sessionId}`)}`;
    } else {
      const accountActor = await getClassroomActor(sessionId);
      const matches = tokenActor && accountActor && (
        accountActor.role === "TEACHER" || (accountActor.role === "STUDENT" && tokenActor.studentId === accountActor.studentId)
      );
      path = matches ? `/classroom/${sessionId}` : `/classroom/${sessionId}?invalid=1`;
    }
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return classroomFailure(error);
  }
}
