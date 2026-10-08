import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getClassroomActor } from "@/lib/classroom-auth";
import { getClassroomState } from "@/lib/data/classrooms";
import { classroomIceServers } from "@/lib/classroom-ice";
import ClassroomRoom from "@/components/classroom-room";

export default async function TeacherClassroomPage({ params }) {
  await requireRole("TEACHER");
  const { sessionId } = await params;
  const actor = await getClassroomActor(sessionId);
  if (actor?.role !== "TEACHER") notFound();
  const state = await getClassroomState(actor);
  const host = (await headers()).get("host")?.split(":")[0];
  // getClassroomState validates the configured public origin before creating
  // the teacher's invitation links, including when this page opens locally.
  const localOnly = ["localhost", "127.0.0.1"].includes(host) && !process.env.CLASSROOM_PUBLIC_URL?.trim();
  return <ClassroomRoom key={sessionId} initialState={state} iceServers={classroomIceServers()} localOnly={localOnly} />;
}
