import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE, formatMonth, egp } from "@/lib/labels";

// history rows come from getStudentPaymentHistory(): { month, due, paid, status }
export default function PaymentHistory({ history }) {
  if (history.length === 0) {
    return <p className="ui-empty">مفيش اشتراكات متسجلة لسه.</p>;
  }

  return (
    <ul className="ui-card divide-y divide-gray-200 text-sm">
      {history.map((r) => (
        <li key={r.month} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <span className="font-medium text-slate-800">{formatMonth(r.month)}</span>
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-slate-500">
              {egp(r.paid)} من {egp(r.due)}
            </span>
            <span className={`ui-badge ${PAYMENT_STATUS_BADGE[r.status]}`}>
              {PAYMENT_STATUS_LABELS[r.status]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
