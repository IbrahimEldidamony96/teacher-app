import { notFound } from "next/navigation";
import { getClassroomActor } from "@/lib/classroom-auth";
import { getClassroomState } from "@/lib/data/classrooms";
import { classroomIceServers } from "@/lib/classroom-ice";
import ClassroomRoom from "@/components/classroom-room";

export const metadata = { title: "الحصة التفاعلية", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function StudentClassroomPage({ params }) {
  const { sessionId } = await params;
  const actor = await getClassroomActor(sessionId);
  if (!actor) notFound();
  const state = await getClassroomState(actor);
  return <main className="classroom-page app-content"><ClassroomRoom key={`${sessionId}:${actor.participantId ?? "teacher"}`} initialState={state} iceServers={classroomIceServers()} /></main>;
}
