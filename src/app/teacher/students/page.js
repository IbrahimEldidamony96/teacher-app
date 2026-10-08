import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listStudents } from "@/lib/data/students";
import { listGroups } from "@/lib/data/groups";
import { GRADE_LABELS } from "@/lib/labels";
import { card } from "@/app/teacher/ui";
import CreateStudentForm from "./create-student-form";

export default async function StudentsPage() {
  await requireRole("TEACHER");
  const [students, groups] = await Promise.all([listStudents(), listGroups()]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">الطلاب ({students.length})</h1>

      <CreateStudentForm groups={groups.map(({ id, name }) => ({ id, name }))} />

      {students.length === 0 ? (
        <p className="text-gray-500">مفيش طلاب لسه.</p>
      ) : (
        <ul className={card}>
          {students.map((s) => (
            <li key={s.id}>
              <Link
                href={`/teacher/students/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-500/10"
              >
                <span className="font-medium">
                  {s.name}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({GRADE_LABELS[s.gradeLevel]})
                  </span>
                </span>
                <span className="text-sm text-gray-500">
                  {s.enrollments.length > 0
                    ? s.enrollments.map((e) => e.group.name).join("، ")
                    : "من غير مجموعة"}
                  {s.parents.length > 0 && " - ولي الأمر مربوط"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
