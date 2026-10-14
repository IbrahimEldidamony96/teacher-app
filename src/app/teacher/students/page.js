import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getStudentRoster } from "@/lib/data/students";
import { listGroups } from "@/lib/data/groups";
import { GRADE_LABELS, GRADE_ORDER } from "@/lib/labels";
import { input } from "@/app/teacher/ui";
import CreateStudentForm from "./create-student-form";
import ImportStudentsForm from "./import-students-form";
import RosterList from "./roster-list";

export default async function StudentsPage({ searchParams }) {
  await requireRole("TEACHER");
  const query = await searchParams;
  const search = typeof query?.q === "string" ? query.q.trim().slice(0, 150) : "";
  const gradeLevel = GRADE_ORDER.includes(query?.grade) ? query.grade : "";
  const groupId = typeof query?.group === "string" ? query.group : "";
  const archived = ["active", "archived", "all"].includes(query?.archived) ? query.archived : "active";
  const requestedPage = /^\d{1,6}$/.test(query?.page ?? "") ? Number(query.page) : 1;
  const [roster, groups] = await Promise.all([getStudentRoster({ search, gradeLevel, groupId, archived, page: requestedPage }), listGroups()]);
  const choices = groups.map(({ id, name }) => ({ id, name }));
  function href(page) {
    const params = new URLSearchParams({ archived, page: String(page) });
    if (search) params.set("q", search);
    if (gradeLevel) params.set("grade", gradeLevel);
    if (groupId) params.set("group", groupId);
    return `/teacher/students?${params}`;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">الطلاب ({roster.total})</h1>

      <CreateStudentForm groups={choices} />
      <ImportStudentsForm groups={choices} />
      <form method="get" className="ui-form flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">بحث بالاسم أو رقم الطالب<input name="q" defaultValue={search} maxLength={150} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">الصف الدراسي<select name="grade" defaultValue={gradeLevel} className={input}><option value="">كل الصفوف</option>{GRADE_ORDER.map((grade) => <option key={grade} value={grade}>{GRADE_LABELS[grade]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">المجموعة<select name="group" defaultValue={groupId} className={input}><option value="">كل المجموعات</option>{choices.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">الحالة<select name="archived" defaultValue={archived} className={input}><option value="active">نشط</option><option value="archived">مؤرشف</option><option value="all">الكل</option></select></label>
        <button className="ui-button-secondary">بحث وتصفية</button><Link href="/teacher/students" className="text-sm underline">مسح البحث</Link>
      </form>

      <RosterList key={href(roster.page)} groups={choices} students={roster.students.map((student) => ({ id: student.id, name: student.name, gradeLevel: student.gradeLevel, archived: Boolean(student.archivedAt), linkedAccount: Boolean(student.account), groups: student.enrollments.map((enrollment) => enrollment.group.name) }))} />
      <nav aria-label="صفحات الطلاب" className="flex flex-wrap items-center gap-3 text-sm">
        {roster.page > 1 && <Link href={href(roster.page - 1)} className="ui-button-secondary">السابق</Link>}
        <span>صفحة {roster.page} من {roster.pages} · 25 طالب في الصفحة</span>
        {roster.page < roster.pages && <Link href={href(roster.page + 1)} className="ui-button-secondary">التالي</Link>}
      </nav>
    </div>
  );
}
