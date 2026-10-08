import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE, formatMonth, egp } from "@/lib/labels";

// history rows come from getStudentPaymentHistory(): { month, due, paid, status }
export default function PaymentHistory({ history }) {
  if (history.length === 0) {
    return <p className="text-sm text-gray-500">مفيش اشتراكات متسجلة لسه.</p>;
  }

  return (
    <ul className="divide-y divide-gray-300 rounded border border-gray-300 text-sm">
      {history.map((r) => (
        <li key={r.month} className="flex items-center justify-between gap-3 px-3 py-2">
          <span>{formatMonth(r.month)}</span>
          <span className="flex items-center gap-2">
            <span className="text-gray-500">
              {egp(r.paid)} من {egp(r.due)}
            </span>
            <span className={`rounded px-2 py-1 text-xs ${PAYMENT_STATUS_BADGE[r.status]}`}>
              {PAYMENT_STATUS_LABELS[r.status]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
