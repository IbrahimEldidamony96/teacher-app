import { formatDate, formatRange } from "@/lib/labels";
import { dateKey, SCHEDULE_EXCEPTION_LABELS } from "@/lib/schedule";

export default function DatedSchedule({ slots = [], exceptions = [] }) {
  const dates = [...new Set(slots.map((slot) => slot.date))];
  return <div className="space-y-4">
    {slots.length === 0 ? <p className="ui-empty">مفيش حصص خلال الأسبوعين القادمين.</p> : <div className="schedule-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {dates.map((date) => <section key={date} className="schedule-day ui-panel min-w-0">
        <h4 className="mb-3 text-sm font-semibold">{formatDate(date)}</h4>
        <ul className="space-y-3">
          {slots.filter((slot) => slot.date === date).map((slot) => <li key={slot.id} className="schedule-slot text-sm">
            <p className="font-semibold">{slot.group.name}</p>
            <p className="schedule-time mt-2 text-xs">{formatRange(slot.startTime, slot.endTime)}</p>
            {slot.kind !== "WEEKLY" && <p className="mt-1 text-xs text-blue-600">{SCHEDULE_EXCEPTION_LABELS[slot.kind]}</p>}
            {slot.location && <p className="mt-1 text-xs text-gray-500">{slot.location}</p>}
            {slot.reason && <p className="mt-1 text-xs text-gray-500">{slot.reason}</p>}
          </li>)}
        </ul>
      </section>)}
    </div>}
    {exceptions.length > 0 && <ul className="space-y-2 text-sm text-gray-600">
      {exceptions.map((row) => <li key={row.id}>
        {row.group.name}: {SCHEDULE_EXCEPTION_LABELS[row.kind]} يوم {formatDate(dateKey(row.date))}
        {row.replacementDate && <>؛ الموعد الجديد {formatDate(dateKey(row.replacementDate))}</>}
        {row.reason && <> — {row.reason}</>}
      </li>)}
    </ul>}
  </div>;
}
