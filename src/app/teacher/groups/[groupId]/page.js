import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getGroupDetail, listStudentsNotInGroup } from "@/lib/data/groups";
import {
  DAY_ORDER,
  DAY_LABELS,
  GRADE_LABELS,
  egp,
} from "@/lib/labels";
import WeekSchedule from "@/components/week-schedule";
import {
  updateGroupAction,
  enrollStudentAction,
  unenrollStudentAction,
  addSlotAction,
  deleteSlotAction,
} from "@/app/teacher/actions";
import { input, button, dangerButton, card } from "@/app/teacher/ui";

export default async function GroupPage({ params }) {
  await requireRole("TEACHER");
  const { groupId } = await params;

  const group = await getGroupDetail(groupId);
  if (!group) notFound();

  const available = await listStudentsNotInGroup(groupId);
  const slots = group.slots.map((s) => ({
    ...s,
    group: { name: group.name, gradeLevel: group.gradeLevel },
  }));

  return (
    <div className="space-y-10">
      <div>
        <Link href="/teacher/groups" className="text-sm text-gray-500 hover:text-blue-600">
          رجوع للمجموعات
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {group.name}{" "}
          <span className="text-base font-normal text-gray-500">
            ({GRADE_LABELS[group.gradeLevel]})
          </span>
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/teacher/attendance/${group.id}`} className={button}>
            تسجيل الحضور
          </Link>
          <Link href={`/teacher/homework?group=${group.id}`} className={button}>
            الواجبات
          </Link>
          <Link href={`/teacher/exams?group=${group.id}`} className={button}>
            الدرجات
          </Link>
        </div>
      </div>

      {/* Edit group */}
      <form action={updateGroupAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="groupId" value={group.id} />
        <label className="flex flex-col gap-1 text-sm">
          اسم المجموعة
          <input name="name" defaultValue={group.name} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          الاشتراك الشهري (جنيه)
          <input
            name="monthlyFee"
            type="number"
            min="0"
            step="1"
            defaultValue={group.monthlyFee}
            className={`${input} w-32`}
          />
        </label>
        <button type="submit" className={button}>
          حفظ
        </button>
      </form>

      {/* Students */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الطلاب ({group.enrollments.length})</h2>

        {available.length > 0 ? (
          <form action={enrollStudentAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="groupId" value={group.id} />
            <label className="flex flex-col gap-1 text-sm">
              الطالب
              <select name="studentId" required className={input}>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({GRADE_LABELS[s.gradeLevel]})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              اشتراك خاص (اختياري)
              <input
                name="monthlyFee"
                type="number"
                min="0"
                step="1"
                placeholder={String(group.monthlyFee)}
                className={`${input} w-32`}
              />
            </label>
            <button type="submit" className={button}>
              إضافة للمجموعة
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">
            مفيش طلاب متاحين للإضافة. سجّل طالب جديد من{" "}
            <Link href="/teacher/students" className="underline">
              صفحة الطلاب
            </Link>
            .
          </p>
        )}

        {group.enrollments.length > 0 && (
          <ul className={card}>
            {group.enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <Link href={`/teacher/students/${e.student.id}`} className="hover:underline">
                    {e.student.name}
                  </Link>{" "}
                  <span className="text-sm text-gray-500">
                    {egp(e.monthlyFee ?? group.monthlyFee)}
                    {e.monthlyFee !== null && " (اشتراك خاص)"}
                  </span>
                </span>
                <form action={unenrollStudentAction}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="studentId" value={e.student.id} />
                  <button type="submit" className={dangerButton}>
                    شيل من المجموعة
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Weekly sessions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">مواعيد الحصص</h2>

        <form action={addSlotAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="groupId" value={group.id} />
          <label className="flex flex-col gap-1 text-sm">
            اليوم
            <select name="day" required className={input}>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            من
            <input type="time" name="startTime" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            إلى
            <input type="time" name="endTime" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            المكان (اختياري)
            <input name="location" placeholder="السنتر / البيت" className={input} />
          </label>
          <button type="submit" className={button}>
            إضافة حصة
          </button>
        </form>

        <WeekSchedule
          slots={slots}
          renderAction={(slot) => (
            <form action={deleteSlotAction}>
              <input type="hidden" name="slotId" value={slot.id} />
              <button type="submit" className={dangerButton}>
                مسح
              </button>
            </form>
          )}
        />
      </section>
    </div>
  );
}
