import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { listClassrooms } from "@/lib/data/classrooms";
import { cairoToday } from "@/lib/time";
import NewClassroomForm from "./new-classroom-form";

const statusLabels = { DRAFT: "لم تبدأ", ACTIVE: "مفتوحة", ENDED: "انتهت" };

export default async function ClassroomsPage() {
  const user = await requireRole("TEACHER");
  const [groups, sessions] = await Promise.all([listGroups(), listClassrooms(user)]);
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">الفيديو والحصص التفاعلية</h1>
    <p className="text-sm text-gray-500">ارفع فيديو أو افتح بثاً مباشراً، شارك دعوات الطلاب، وتابع الأسئلة ثم راجع الحضور.</p>
    <NewClassroomForm groups={groups.map(({ id, name }) => ({ id, name }))} today={cairoToday()} />
    <ul className="divide-y divide-gray-200 rounded-xl border border-gray-300">
      {sessions.length === 0 && <li className="p-4 text-gray-500">مفيش حصص فيديو لسه.</li>}
      {sessions.map((session) => <li key={session.id}><Link href={`/teacher/classrooms/${session.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-gray-500/5">
        <div><p className="font-medium">{session.title}</p><p className="text-xs text-gray-500">{session.group.name} · {session.attendanceDate.toISOString().slice(0, 10)} · {session._count.participants} طالب</p></div>
        <span className="text-xs text-blue-600">{session.mode === "LIVE" ? "بث مباشر" : "تسجيل"} · {statusLabels[session.status]}</span>
      </Link></li>)}
    </ul>
  </div>;
}
