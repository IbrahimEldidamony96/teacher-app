import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app-shell";
export default async function StudentClassroomsPage(){
 const user=await requireRole("STUDENT");
 const studentId=user.studentProfile.id;
 const sessions=await prisma.classroomSession.findMany({
  where:{group:{archivedAt:null,enrollments:{some:{studentId,endedAt:null}}},participants:{some:{studentId}}},
  select:{id:true,title:true,mode:true,status:true,attendanceDate:true,group:{select:{name:true}}},
  orderBy:{attendanceDate:"desc"},take:60
 });
 return <AppShell teacher={false}><div className="space-y-5">
 <h1 className="text-2xl font-semibold">حصصي الأونلاين</h1>
 <ul className="ui-card divide-y divide-gray-200">{sessions.map(s=><li key={s.id}><Link className="block p-4 hover:underline" href={`/classroom/${s.id}`}>
 <strong>{s.title}</strong><p className="text-sm text-gray-500">{s.group.name} · {s.attendanceDate.toISOString().slice(0,10)} · {s.mode==="LIVE"?"حصة مباشرة":"فيديو مسجل"}</p>
 </Link></li>)}{sessions.length===0&&<li className="p-4">مفيش حصص متاحة حاليًا.</li>}</ul></div></AppShell>;
}
