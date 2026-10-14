import { DAY_ORDER, DAY_LABELS, GRADE_LABELS, formatRange } from "@/lib/labels";

// Read-only weekly schedule: only days that have sessions, in Egyptian week order.
// Each slot needs slot.group.name. Pass renderAction to add per-slot controls.
export default function WeekSchedule({ slots, renderAction }) {
  if (slots.length === 0) {
    return <p className="ui-empty">مفيش حصص متسجلة لسه.</p>;
  }

  const days = DAY_ORDER.filter((d) => slots.some((s) => s.day === d));

  return (
    <div className="schedule-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {days.map((day) => {
        const daySlots = slots
          .filter((s) => s.day === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        return (
          <section key={day} className="schedule-day ui-panel min-w-0">
            <h3 className="mb-4 font-bold text-slate-900">{DAY_LABELS[day]}</h3>
            <ul className="space-y-3">
              {daySlots.map((s) => (
                <li key={s.id} className="schedule-slot min-w-0 text-sm">
                  <div className="break-words font-semibold text-slate-800">{s.group.name}</div>
                  {s.group.gradeLevel && (
                    <div className="mt-1 text-xs text-slate-500">{GRADE_LABELS[s.group.gradeLevel]}</div>
                  )}
                  <div className="schedule-time mt-3 text-xs">{formatRange(s.startTime, s.endTime)}</div>
                  {s.location && <div className="mt-1 break-words text-xs text-slate-500">{s.location}</div>}
                  {renderAction && <div className="mt-3">{renderAction(s)}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
