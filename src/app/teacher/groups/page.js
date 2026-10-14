import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { GRADE_ORDER, GRADE_LABELS, egp } from "@/lib/labels";
import { createGroupAction } from "@/app/teacher/actions";
import { input, button, card } from "@/app/teacher/ui";
import LifecycleForm from "@/app/teacher/students/lifecycle-form";

export default async function GroupsPage({ searchParams }) {
  await requireRole("TEACHER");
  const query = await searchParams;
  const archived = ["active", "archived", "all"].includes(query?.archived) ? query.archived : "active";
  const groups = await listGroups({ archived });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">المجموعات</h1>
      <form method="get" className="ui-form flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">الحالة<select name="archived" defaultValue={archived} className={input}><option value="active">نشط</option><option value="archived">مؤرشف</option><option value="all">الكل</option></select></label>
        <button className="ui-button-secondary">عرض</button>
      </form>

      <form action={createGroupAction} className="ui-form flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          اسم المجموعة
          <input name="name" placeholder="أولى ابتدائي - السبت" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          الصف الدراسي
          <select name="gradeLevel" required className={input}>
            {GRADE_ORDER.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          الاشتراك الشهري (جنيه)
          <input
            name="monthlyFee"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className={`${input} w-32`}
          />
        </label>
        <button type="submit" className={button}>
          إنشاء مجموعة
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="ui-empty">مفيش مجموعات لسه. ابدأ بإنشاء أول مجموعة.</p>
      ) : (
        <ul className={card}>
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link
                href={`/teacher/groups/${g.id}`}
                className="flex flex-wrap items-center gap-3 hover:underline"
              >
                <span className="font-medium">
                  {g.name}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({GRADE_LABELS[g.gradeLevel]})
                    {g.archivedAt && " · مؤرشفة"}
                  </span>
                </span>
                <span className="text-sm text-gray-500">
                  {g._count.enrollments} طالب - {g._count.slots} حصة في الأسبوع - {egp(g.monthlyFee)}
                </span>
              </Link>
              <LifecycleForm recordId={g.id} archived={Boolean(g.archivedAt)} kind="group" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
