import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getParentHomework } from "@/lib/data/homework";
import { cairoToday } from "@/lib/time";
import { homeworkState } from "@/lib/learning-policy";
import { HOMEWORK_LABELS, formatDate } from "@/lib/labels";
import AppShell from "@/components/app-shell";
import HomeworkSubmissionForm from "./submission-form";

export default async function ParentHomeworkPage({ params, searchParams }) {
  const user = await requireRole("PARENT");
  const { homeworkId } = await params;
  const query = await searchParams;
  const studentId = typeof query?.student === "string" ? query.student : "";
  if (!studentId) notFound();
  const homework = await getParentHomework(user.id, homeworkId, studentId);
  if (!homework) notFound();
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true } });
  const submission = homework.submissions[0] ?? null;
  const result = homework.results[0] ?? null;
  const state = homeworkState(homework, cairoToday(), submission, result);

  return (
    <AppShell teacher={false}>
      <div className="space-y-6">
        <Link href="/dashboard" className="text-sm text-blue-600 underline">رجوع للمتابعة</Link>
        <section className="ui-panel space-y-3">
          <h1 className="text-2xl font-semibold">{homework.title}</h1>
          <p className="text-sm text-gray-500">{student.name} · {homework.group.name} · التسليم لحد {formatDate(homework.dueDate)}</p>
          <p className={`text-sm ${state === "OVERDUE" ? "text-red-600" : "text-blue-600"}`}>
            {state === "CHECKED" ? `تمت المراجعة: ${HOMEWORK_LABELS[result.status]}` : state === "SUBMITTED" ? "تم التسليم · في انتظار مراجعة المدرس" : state === "OVERDUE" ? "موعد التسليم فات. تقدر تسلّم الواجب متأخراً." : "في انتظار التسليم"}
          </p>
          {homework.description && <p className="whitespace-pre-wrap text-sm">{homework.description}</p>}
          {homework.attachments.length > 0 && <div className="space-y-2">
            <h2 className="font-semibold">ملفات الواجب</h2>
            <ul className="space-y-2 text-sm">
              {homework.attachments.map((file) => <li key={file.id}><a className="text-blue-600 underline" href={`/api/homework/${homework.id}/attachments/${file.id}?student=${encodeURIComponent(studentId)}`}>{file.fileName}</a> <span className="text-gray-500">({Math.ceil(file.fileSize / 1024)} كيلوبايت)</span></li>)}
            </ul>
          </div>}
        </section>
        <section className="ui-panel space-y-4">
          <h2 className="text-lg font-semibold">تسليم {student.name}</h2>
          {submission && <p className="text-xs text-gray-500">آخر حفظ: {new Date(submission.updatedAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</p>}
          {result ? <div className="space-y-3">
            {submission?.body && <p className="whitespace-pre-wrap text-sm">{submission.body}</p>}
            {submission?.fileName && <a className="text-sm text-blue-600 underline" href={`/api/homework/${homeworkId}/submissions/${studentId}/file`}>{submission.fileName}</a>}
            <p className="text-sm text-gray-500">كلّم المدرس لو محتاج تعدّل التسليم بعد المراجعة.</p>
          </div> : <HomeworkSubmissionForm homeworkId={homework.id} studentId={studentId} submission={submission} />}
        </section>
      </div>
    </AppShell>
  );
}
