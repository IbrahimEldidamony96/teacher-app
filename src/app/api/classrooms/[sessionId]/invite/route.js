import { NextResponse } from "next/server";
import { actorFromClassroomInvite } from "@/lib/classroom-auth";
import { classroomCookieName } from "@/lib/classroom-invites";
import { classroomFailure } from "@/lib/classroom-http";
import { classroomRequestOrigin } from "@/lib/classroom-origin";

export async function GET(request, { params }) {
  try {
    const { sessionId } = await params;
    const actor = await actorFromClassroomInvite(sessionId, new URL(request.url).searchParams.get("token"));
    const destination = new URL(`/classroom/${sessionId}${actor ? "" : "?invalid=1"}`, classroomRequestOrigin(request));
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (actor) response.cookies.set(classroomCookieName(sessionId), new URL(request.url).searchParams.get("token"), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return classroomFailure(error);
  }
}
