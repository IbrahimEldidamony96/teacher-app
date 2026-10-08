import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { listExams } from "@/lib/data/exams";
import { cairoToday } from "@/lib/time";
import { formatDate, formatScore } from "@/lib/labels";
import { createExamAction } from "@/app/teacher/actions";
import { input, button, card } from "@/app/teacher/ui";

export default async function ExamsPage({ searchParams }) {
  await requireRole("TEACHER");
  const query = await searchParams;
  const groupId = typeof query?.group === "string" ? query.group : "";

  const [groups, exams] = await Promise.all([listGroups(), listExams(groupId || null)]);
  const today = cairoToday();
  const activeGroup = groups.find((g) => g.id === groupId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">الاختبارات والدرجات</h1>
        {activeGroup && (
          <p className="text-sm text-gray-500">
            بيعرض اختبارات {activeGroup.name} بس -{" "}
            <Link href="/teacher/exams" className="underline">
              عرض الكل
            </Link>
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-gray-500">
          محتاج تعمل مجموعة الأول من{" "}
          <Link href="/teacher/groups" className="underline">
            صفحة المجموعات
          </Link>
          .
        </p>
      ) : (
        <form action={createExamAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            المجموعة
            <select name="groupId" defaultValue={groupId} required className={input}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            اسم الاختبار
            <input name="title" placeholder="اختبار الشهر" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            التاريخ
            <input type="date" name="date" defaultValue={today} required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الدرجة الكاملة
            <input
              name="maxScore"
              type="number"
              min="1"
              step="0.5"
              defaultValue="20"
              required
              className={`${input} w-24`}
            />
          </label>
          <button type="submit" className={button}>
            إضافة اختبار
          </button>
        </form>
      )}

      {exams.length === 0 ? (
        <p className="text-gray-500">مفيش اختبارات لسه.</p>
      ) : (
        <ul className={card}>
          {exams.map((e) => (
            <li key={e.id}>
              <Link
                href={`/teacher/exams/${e.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-500/10"
              >
                <span>
                  <span className="font-medium">{e.title}</span>{" "}
                  <span className="text-sm text-gray-500">
                    - {e.group.name} - {formatDate(e.date)}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-gray-500">
                  {e.stats.taken === 0
                    ? "لسه محدش اتصحح"
                    : `متوسط ${formatScore(e.stats.average)} من ${formatScore(e.maxScore)} (${e.stats.averagePercent}%)`}
                  {e.stats.absent > 0 && ` - ${e.stats.absent} غايب`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
