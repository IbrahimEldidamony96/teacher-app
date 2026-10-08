import { DAY_ORDER, DAY_LABELS, GRADE_LABELS, formatRange } from "@/lib/labels";

// Read-only weekly schedule: only days that have sessions, in Egyptian week order.
// Each slot needs slot.group.name. Pass renderAction to add per-slot controls.
export default function WeekSchedule({ slots, renderAction }) {
  if (slots.length === 0) {
    return <p className="text-gray-500">مفيش حصص متسجلة لسه.</p>;
  }

  const days = DAY_ORDER.filter((d) => slots.some((s) => s.day === d));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {days.map((day) => {
        const daySlots = slots
          .filter((s) => s.day === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        return (
          <section key={day} className="rounded border border-gray-300 p-3">
            <h3 className="mb-2 font-semibold">{DAY_LABELS[day]}</h3>
            <ul className="space-y-2">
              {daySlots.map((s) => (
                <li key={s.id} className="rounded bg-blue-500/10 p-2 text-sm">
                  <div className="font-medium">{s.group.name}</div>
                  {s.group.gradeLevel && (
                    <div className="text-xs text-gray-500">{GRADE_LABELS[s.group.gradeLevel]}</div>
                  )}
                  <div className="text-xs text-gray-500">{formatRange(s.startTime, s.endTime)}</div>
                  {s.location && <div className="text-xs text-gray-500">{s.location}</div>}
                  {renderAction && <div className="mt-2">{renderAction(s)}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
