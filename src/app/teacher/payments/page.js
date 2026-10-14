import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listGroups } from "@/lib/data/groups";
import { getMonthOverview } from "@/lib/data/payments";
import { cairoMonth, isValidMonth, shiftMonth } from "@/lib/time";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_BADGE,
  formatMonth,
  egp,
} from "@/lib/labels";
import { recordPaymentAction, sendPaymentReminderAction } from "@/app/teacher/actions";
import { input, button, card } from "@/app/teacher/ui";

const TABS = [
  ["all", "الكل"],
  ["unpaid", "لسه ما دفعش"],
  ["partial", "دفع جزء"],
  ["paid", "دافع"],
];
const STATUS_OF_TAB = { unpaid: "UNPAID", partial: "PARTIAL", paid: "PAID" };

function href({ month, group, status }) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (group) params.set("group", group);
  if (status && status !== "all") params.set("status", status);
  const qs = params.toString();
  return `/teacher/payments${qs ? `?${qs}` : ""}`;
}

export default async function PaymentsPage({ searchParams }) {
  await requireRole("TEACHER");
  const query = await searchParams;

  const current = cairoMonth();
  const month = typeof query?.month === "string" && isValidMonth(query.month) ? query.month : current;
  const group = typeof query?.group === "string" ? query.group : "";
  const status = TABS.some(([key]) => key === query?.status) ? query.status : "all";
  const saved = query?.saved === "1";

  const [groups, overview] = await Promise.all([listGroups(), getMonthOverview(month, group || null)]);
  const { totals } = overview;
  const rows = status === "all" ? overview.rows : overview.rows.filter((r) => r.status === STATUS_OF_TAB[status]);
  const here = href({ month, group, status });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">الاشتراكات</h1>

      {/* Month navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={href({ month: shiftMonth(month, -1), group, status })}
          className="ui-button-secondary"
        >
          الشهر اللي فات
        </Link>
        <span className="text-lg font-medium">{formatMonth(month)}</span>
        <Link
          href={href({ month: shiftMonth(month, 1), group, status })}
          className="ui-button-secondary"
        >
          الشهر الجاي
        </Link>
        {month !== current && (
          <Link href={href({ group, status })} className="text-sm text-blue-600 underline">
            الشهر الحالي
          </Link>
        )}
      </div>

      {/* Group filter (GET form) */}
      <form method="get" className="ui-form flex flex-wrap items-end gap-3">
        <input type="hidden" name="month" value={month} />
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <label className="flex flex-col gap-1 text-sm">
          المجموعة
          <select name="group" defaultValue={group} className={input}>
            <option value="">كل المجموعات</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ui-button-secondary">
          تصفية
        </button>
      </form>

      {saved && (
        <p className="rounded bg-green-600/15 px-4 py-3 text-sm text-green-600">اتسجلت الدفعة.</p>
      )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="ui-panel">
          <div className="text-sm text-gray-500">المطلوب</div>
          <div className="text-xl font-semibold">{egp(totals.due)}</div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-gray-500">اتحصّل</div>
          <div className="text-xl font-semibold text-green-600">{egp(totals.paid)}</div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-gray-500">المتبقي</div>
          <div className="text-xl font-semibold text-red-500">{egp(totals.remaining)}</div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map(([key, label]) => {
          const count = key === "all" ? overview.rows.length : totals.counts[STATUS_OF_TAB[key]];
          const active = status === key;
          return (
            <Link
              key={key}
              href={href({ month, group, status: key })}
              className={`rounded border px-3 py-1 ${
                active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-400"
              }`}
            >
              {label} ({count})
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="ui-empty">مفيش طلاب هنا للشهر ده.</p>
      ) : (
        <ul className={card}>
          {rows.map((r) => (
            <li key={r.student.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/teacher/students/${r.student.id}`} className="font-medium hover:underline">
                    {r.student.name}
                  </Link>
                  <span className="block text-xs text-gray-500">{r.groups.join("، ")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">
                    {egp(r.paid)} من {egp(r.due)}
                    {r.paid > r.due && ` (زيادة ${egp(r.paid - r.due)})`}
                  </span>
                  <span className={`ui-badge ${PAYMENT_STATUS_BADGE[r.status]}`}>
                    {PAYMENT_STATUS_LABELS[r.status]}
                  </span>
                </div>
              </div>

              {r.remaining > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                <form action={recordPaymentAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="studentId" value={r.student.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="returnTo" value={here} />
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    required
                    defaultValue={r.remaining}
                    aria-label="المبلغ"
                    className={`${input} w-28`}
                  />
                  <select name="method" aria-label="طريقة الدفع" className={input}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={button}>
                    تسجيل دفعة
                  </button>
                </form>
                <form action={sendPaymentReminderAction}>
                  <input type="hidden" name="studentId" value={r.student.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="returnTo" value={here} />
                  <button
                    type="submit"
                    className="ui-button-secondary text-xs"
                  >
                    ابعت تذكير واتساب
                  </button>
                </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
