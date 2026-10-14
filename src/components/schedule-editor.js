"use client";

import { useActionState, useState } from "react";
import { addWeeklySlotAction, updateWeeklySlotAction, deleteWeeklySlotAction, createExceptionAction, deleteExceptionAction } from "@/app/teacher/schedule/actions";
import { button, dangerButton, input } from "@/app/teacher/ui";
import { DAY_ORDER, DAY_LABELS, formatDate, formatRange } from "@/lib/labels";
import { dateKey, SCHEDULE_EXCEPTION_KINDS, SCHEDULE_EXCEPTION_LABELS } from "@/lib/schedule";
import WeekSchedule from "@/components/week-schedule";

function ScheduleForm({ action, children, submitLabel = "حفظ", danger = false }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} aria-busy={pending} className="ui-form flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className={danger ? dangerButton : button} disabled={pending}>
        {pending ? "جاري الحفظ..." : submitLabel}
      </button>
      {state?.message && <p role={state.error ? "alert" : "status"} className={`w-full text-sm ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.message}</p>}
    </form>
  );
}

function TimeFields({ slot = {} }) {
  return <>
    <label className="flex flex-col gap-1 text-sm">من<input type="time" name="startTime" required defaultValue={slot.startTime} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm">إلى<input type="time" name="endTime" required defaultValue={slot.endTime} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm">المكان (اختياري)<input name="location" maxLength={200} defaultValue={slot.location ?? ""} className={input} /></label>
  </>;
}

function WeeklyFields({ slot = {} }) {
  return <>
    <label className="flex flex-col gap-1 text-sm">اليوم
      <select name="day" required defaultValue={slot.day ?? "SAT"} className={input}>
        {DAY_ORDER.map((day) => <option key={day} value={day}>{DAY_LABELS[day]}</option>)}
      </select>
    </label>
    <TimeFields slot={slot} />
  </>;
}

export function EditSlotForm({ slot }) {
  return (
    <div className="space-y-3">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-blue-600">تعديل الموعد الأسبوعي</summary>
        <div className="mt-3">
          <ScheduleForm key={`${slot.day}:${slot.startTime}:${slot.endTime}:${slot.location}`} action={updateWeeklySlotAction}>
            <input type="hidden" name="slotId" value={slot.id} />
            <WeeklyFields slot={slot} />
          </ScheduleForm>
        </div>
      </details>
      <ScheduleForm action={deleteWeeklySlotAction} submitLabel="حذف الموعد الأسبوعي" danger>
        <input type="hidden" name="slotId" value={slot.id} />
      </ScheduleForm>
    </div>
  );
}

function ExceptionForm({ groups, slots, today }) {
  const [kind, setKind] = useState("CANCEL");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const needsSlot = ["CANCEL", "RESCHEDULE"].includes(kind);
  const needsTimes = ["MAKEUP", "RESCHEDULE"].includes(kind);
  const groupSlots = slots.filter((slot) => slot.groupId === groupId);
  return (
    <ScheduleForm action={createExceptionAction} submitLabel="إضافة تعديل">
      <label className="flex flex-col gap-1 text-sm">المجموعة
        <select name="groupId" required value={groupId} onChange={(event) => setGroupId(event.target.value)} className={input}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">التعديل
        <select name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className={input}>
          {SCHEDULE_EXCEPTION_KINDS.map((value) => <option key={value} value={value}>{SCHEDULE_EXCEPTION_LABELS[value]}</option>)}
        </select>
      </label>
      {needsSlot && <label className="flex flex-col gap-1 text-sm">الحصة الأصلية
        <select key={groupId} name="slotId" required className={input} defaultValue="">
          <option value="">اختار الحصة</option>
          {groupSlots.map((slot) => <option key={slot.id} value={slot.id}>{DAY_LABELS[slot.day]} — {formatRange(slot.startTime, slot.endTime)}</option>)}
        </select>
      </label>}
      <label className="flex flex-col gap-1 text-sm">{needsSlot ? "تاريخ الحصة الأصلية" : "التاريخ"}<input type="date" name="date" min={today} required className={input} /></label>
      {kind === "RESCHEDULE" && <label className="flex flex-col gap-1 text-sm">التاريخ الجديد<input type="date" name="replacementDate" min={today} required className={input} /></label>}
      {needsTimes && <TimeFields />}
      <label className="flex flex-col gap-1 text-sm">السبب (اختياري)<input name="reason" maxLength={1000} className={input} /></label>
    </ScheduleForm>
  );
}

export default function ScheduleEditor({ groups, slots, exceptions, today }) {
  return <div className="space-y-6">
    <WeekSchedule slots={slots} renderAction={(slot) => <EditSlotForm slot={slot} />} />
    {groups.length > 0 && <>
      <section className="ui-panel space-y-3">
        <h2 className="text-lg font-semibold">إضافة موعد أسبوعي</h2>
        <ScheduleForm action={addWeeklySlotAction} submitLabel="إضافة حصة">
          <label className="flex flex-col gap-1 text-sm">المجموعة
            <select name="groupId" required className={input}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          </label>
          <WeeklyFields />
        </ScheduleForm>
      </section>
      <section className="ui-panel space-y-3">
        <h2 className="text-lg font-semibold">تغيير حصة واحدة أو تسجيل إجازة</h2>
        <p className="text-sm text-gray-500">التغيير يطبق على التاريخ المحدد فقط. الإجازة تلغي حصص المجموعة في هذا اليوم. الجدول الأسبوعي يستمر في باقي الأيام.</p>
        <ExceptionForm groups={groups} slots={slots} today={today} />
      </section>
    </>}
    <section className="ui-panel space-y-3">
      <h2 className="text-lg font-semibold">التعديلات القادمة</h2>
      {exceptions.length === 0 ? <p className="text-sm text-gray-500">مفيش تعديلات قادمة.</p> : <ul className="space-y-4">
        {exceptions.map((row) => <li key={row.id} className="space-y-2 border-b border-gray-200 pb-3 last:border-0">
          <p className="text-sm font-medium">{row.group.name} — {SCHEDULE_EXCEPTION_LABELS[row.kind]} — {formatDate(dateKey(row.date))}</p>
          {row.replacementDate && <p className="text-sm">إلى {formatDate(dateKey(row.replacementDate))}</p>}
          {row.startTime && <p className="text-sm">{formatRange(row.startTime, row.endTime)}{row.location ? ` — ${row.location}` : ""}</p>}
          {row.reason && <p className="text-sm text-gray-500">{row.reason}</p>}
          <ScheduleForm action={deleteExceptionAction} submitLabel="حذف التعديل" danger>
            <input type="hidden" name="exceptionId" value={row.id} />
          </ScheduleForm>
        </li>)}
      </ul>}
    </section>
  </div>;
}
