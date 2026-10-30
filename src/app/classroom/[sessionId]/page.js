import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
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
  if (actor.role === "TEACHER") {
    const account = await currentUser();
    const email = account?.primaryEmailAddress?.emailAddress;
    const returnPath = `/classroom/${sessionId}`;
    return (
      <main className="auth-page">
        <section className="ui-panel mx-auto max-w-lg space-y-4 p-6" aria-labelledby="classroom-account-title">
          <h1 id="classroom-account-title" className="text-2xl font-bold">أنت مسجل بحساب المدرس</h1>
          <p>الحساب الحالي: <bdi>{email || actor.name}</bdi></p>
          <p>فتح دعوة الطالب لا يغيّر الحساب المسجل. للدخول كطالب، سجّل الخروج ثم ادخل ببريد الطالب المرتبط بملفه.</p>
          <div className="flex flex-wrap gap-3">
            <SignOutButton redirectUrl={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}>
              <button className="ui-button">تسجيل الخروج والدخول بحساب الطالب</button>
            </SignOutButton>
            <Link href={`/teacher/classrooms/${sessionId}`} className="ui-button-secondary">فتح الحصة كمدرس</Link>
          </div>
        </section>
      </main>
    );
  }
  const state = await getClassroomState(actor);
  return <main className="classroom-page app-content"><ClassroomRoom key={`${sessionId}:${actor.participantId ?? "teacher"}`} initialState={state} iceServers={classroomIceServers()} /></main>;
}
