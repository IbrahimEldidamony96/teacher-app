import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getExamSheet } from "@/lib/data/exams";
import { formatDate, formatScore } from "@/lib/labels";
import { saveExamAction, deleteExamAction } from "@/app/teacher/actions";
import { input, button, dangerButton } from "@/app/teacher/ui";
import EditExamForm from "../edit-exam-form";

export default async function ExamSheetPage({ params, searchParams }) {
  await requireRole("TEACHER");
  const { examId } = await params;
  const query = await searchParams;

  const sheet = await getExamSheet(examId);
  if (!sheet) notFound();
  const saved = query?.saved === "1";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/teacher/exams" className="text-sm text-gray-500 hover:text-blue-600">
          رجوع للاختبارات
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{sheet.exam.title}</h1>
            <p className="text-sm text-gray-500">
              {sheet.exam.groupName} - {formatDate(sheet.exam.date)} - الدرجة الكاملة{" "}
              {formatScore(sheet.exam.maxScore)}
            </p>
          </div>
          <form action={deleteExamAction}>
            <input type="hidden" name="examId" value={sheet.exam.id} />
            <input type="hidden" name="groupId" value={sheet.exam.groupId} />
            <button type="submit" className={dangerButton}>
              مسح الاختبار
            </button>
          </form>
        </div>
        {sheet.stats.taken > 0 && (
          <p className="mt-2 text-sm text-gray-500">
            متوسط {formatScore(sheet.stats.average)} - أعلى درجة {formatScore(sheet.stats.highest)} - أقل
            درجة {formatScore(sheet.stats.lowest)}
            {sheet.stats.absent > 0 && ` - ${sheet.stats.absent} غايب`}
          </p>
        )}
      </div>

      {saved && (
        <p className="rounded bg-green-600/15 px-4 py-3 text-sm text-green-600">اتحفظت الدرجات.</p>
      )}
      <EditExamForm exam={sheet.exam} />

      {sheet.students.length === 0 ? (
        <p className="ui-empty">مفيش طلاب في المجموعة دي.</p>
      ) : (
        <form action={saveExamAction} className="space-y-4">
          <input type="hidden" name="examId" value={sheet.exam.id} />

          <p className="text-sm text-gray-500">
            سيب الدرجة فاضية للطالب اللي لسه ما اتصححش، أو حط علامة &quot;غايب&quot;.
          </p>
          <p className="text-xs text-gray-500">
            هيتبعت واتساب تلقائي لولي أمر كل طالب اتسجلت له درجة (مرة واحدة بس لكل اختبار).
          </p>

          <ul className="divide-y divide-gray-300 rounded border border-gray-300">
            {sheet.students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <input type="hidden" name="studentId" value={s.id} />
                <span className="min-w-32 font-medium">{s.name}</span>
                <input
                  name={`score_${s.id}`}
                  type="number"
                  min="0"
                  max={sheet.exam.maxScore}
                  step="0.5"
                  defaultValue={s.score ?? ""}
                  placeholder={`من ${formatScore(sheet.exam.maxScore)}`}
                  className={`${input} w-24`}
                />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name={`absent_${s.id}`}
                    defaultChecked={s.absent}
                    className="rounded"
                  />
                  غايب
                </label>
                <input
                  name={`note_${s.id}`}
                  defaultValue={s.note}
                  placeholder="ملاحظة (اختياري)"
                  className={`${input} min-w-40 flex-1`}
                />
              </li>
            ))}
          </ul>

          <button type="submit" className={button}>
            حفظ الدرجات
          </button>
        </form>
      )}
      {sheet.previousStudents.length > 0 && <section className="ui-panel space-y-3">
        <h2 className="font-semibold">درجات الطلاب السابقين</h2>
        <ul className="space-y-2 text-sm">{sheet.previousStudents.map((s) => <li key={s.id}>{s.name} · {s.score === null ? "غايب" : `${formatScore(s.score)} من ${formatScore(sheet.exam.maxScore)}`}</li>)}</ul>
      </section>}
    </div>
  );
}
