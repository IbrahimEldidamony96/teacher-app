import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { listHomework } from "@/lib/data/homework";
import { cairoToday } from "@/lib/time";
import { formatDate } from "@/lib/labels";
import { createHomeworkAction } from "@/app/teacher/actions";
import { input, button, card } from "@/app/teacher/ui";

export default async function HomeworkPage({ searchParams }) {
  await requireRole("TEACHER");
  const query = await searchParams;
  const groupId = typeof query?.group === "string" ? query.group : "";

  const [groups, homework] = await Promise.all([listGroups(), listHomework(groupId || null)]);
  const today = cairoToday();
  const activeGroup = groups.find((g) => g.id === groupId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">الواجبات</h1>
        {activeGroup && (
          <p className="text-sm text-gray-500">
            بيعرض واجبات {activeGroup.name} بس -{" "}
            <Link href="/teacher/homework" className="underline">
              عرض الكل
            </Link>
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="ui-empty">
          محتاج تعمل مجموعة الأول من{" "}
          <Link href="/teacher/groups" className="underline">
            صفحة المجموعات
          </Link>
          .
        </p>
      ) : (
        <form action={createHomeworkAction} className="ui-form flex flex-wrap items-end gap-3">
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
            عنوان الواجب
            <input name="title" placeholder="تمارين ١ لحد ١٠" maxLength={200} required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            التسليم لحد
            <input type="date" name="dueDate" defaultValue={today} required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            تفاصيل (اختياري)
            <textarea name="description" maxLength={10000} rows={2} className={`${input} min-w-48`} />
          </label>
          <button type="submit" className={button}>
            إضافة واجب
          </button>
        </form>
      )}
      {groups.length > 0 && (
        <p className="text-xs text-gray-500">
          بمجرد ما تضيف الواجب، هيتبعت واتساب تلقائي لكل طالب في المجموعة بعنوان الواجب وميعاد التسليم.
        </p>
      )}

      {homework.length === 0 ? (
        <p className="ui-empty">مفيش واجبات لسه.</p>
      ) : (
        <ul className={card}>
          {homework.map((h) => {
            const checked = h.results.length;
            const total = h.group._count.enrollments;
            return (
              <li key={h.id}>
                <Link
                  href={`/teacher/homework/${h.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-500/10"
                >
                  <span>
                    <span className="font-medium">{h.title}</span>{" "}
                    <span className="text-sm text-gray-500">
                      - {h.group.name} - لحد {formatDate(h.dueDate)}
                    </span>
                  </span>
                  <span
                    className={`ui-badge shrink-0 ${
                      checked === 0
                        ? "bg-gray-500/20 text-gray-500"
                        : checked < total
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-green-600/15 text-green-600"
                    }`}
                  >
                    {checked} من {total} اتراجعوا
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
