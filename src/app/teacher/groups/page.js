import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { GRADE_ORDER, GRADE_LABELS, egp } from "@/lib/labels";
import { createGroupAction } from "@/app/teacher/actions";
import { input, button, card } from "@/app/teacher/ui";

export default async function GroupsPage() {
  await requireRole("TEACHER");
  const groups = await listGroups();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">المجموعات</h1>

      <form action={createGroupAction} className="flex flex-wrap items-end gap-3">
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
        <p className="text-gray-500">مفيش مجموعات لسه. ابدأ بإنشاء أول مجموعة.</p>
      ) : (
        <ul className={card}>
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/teacher/groups/${g.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-500/10"
              >
                <span className="font-medium">
                  {g.name}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({GRADE_LABELS[g.gradeLevel]})
                  </span>
                </span>
                <span className="text-sm text-gray-500">
                  {g._count.enrollments} طالب - {g._count.slots} حصة في الأسبوع - {egp(g.monthlyFee)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
