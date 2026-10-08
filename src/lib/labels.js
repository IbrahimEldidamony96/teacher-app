export const GRADE_ORDER = [
  "PRIMARY_1",
  "PRIMARY_2",
  "PRIMARY_3",
  "PRIMARY_4",
  "PRIMARY_5",
  "PRIMARY_6",
  "PREP_1",
  "PREP_2",
  "PREP_3",
  "SEC_1",
  "SEC_2",
  "SEC_3",
];

export const GRADE_LABELS = {
  PRIMARY_1: "أولى ابتدائي",
  PRIMARY_2: "تانية ابتدائي",
  PRIMARY_3: "تالتة ابتدائي",
  PRIMARY_4: "رابعة ابتدائي",
  PRIMARY_5: "خامسة ابتدائي",
  PRIMARY_6: "سادسة ابتدائي",
  PREP_1: "أولى إعدادي",
  PREP_2: "تانية إعدادي",
  PREP_3: "تالتة إعدادي",
  SEC_1: "أولى ثانوي",
  SEC_2: "تانية ثانوي",
  SEC_3: "تالتة ثانوي",
};

// Egyptian week order: Saturday first
export const DAY_ORDER = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

export const DAY_LABELS = {
  SAT: "السبت",
  SUN: "الأحد",
  MON: "الاثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
};

// "16:30" -> "4:30 م"
export function formatTime(value) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "م" : "ص";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatRange(start, end) {
  return `من ${formatTime(start)} إلى ${formatTime(end)}`;
}

export function egp(amount) {
  return `${amount} جنيه`;
}

export const ATTENDANCE_ORDER = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export const ATTENDANCE_LABELS = {
  PRESENT: "حاضر",
  ABSENT: "غايب",
  LATE: "متأخر",
  EXCUSED: "بعذر",
};

// Full class strings (not built dynamically) so Tailwind can detect them
export const ATTENDANCE_BADGE = {
  PRESENT: "bg-green-600/15 text-green-600",
  ABSENT: "bg-red-600/15 text-red-500",
  LATE: "bg-amber-500/15 text-amber-600",
  EXCUSED: "bg-blue-500/15 text-blue-500",
};

export const ATTENDANCE_CHOICE = {
  PRESENT: "peer-checked:bg-green-600 peer-checked:text-white",
  ABSENT: "peer-checked:bg-red-600 peer-checked:text-white",
  LATE: "peer-checked:bg-amber-500 peer-checked:text-white",
  EXCUSED: "peer-checked:bg-blue-600 peer-checked:text-white",
};

// A Date (UTC midnight) or "YYYY-MM-DD" -> "الخميس ٢٤ سبتمبر ٢٠٢٦" (Latin digits)
export function formatDate(date) {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : date;
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export const PAYMENT_METHODS = ["CASH", "WALLET", "INSTAPAY", "OTHER"];

export const PAYMENT_METHOD_LABELS = {
  CASH: "كاش",
  WALLET: "محفظة إلكترونية",
  INSTAPAY: "إنستاباي",
  OTHER: "أخرى",
};

export const PAYMENT_STATUS_LABELS = {
  PAID: "دافع",
  PARTIAL: "دفع جزء",
  UNPAID: "لسه ما دفعش",
};

export const PAYMENT_STATUS_BADGE = {
  PAID: "bg-green-600/15 text-green-600",
  PARTIAL: "bg-amber-500/15 text-amber-600",
  UNPAID: "bg-red-600/15 text-red-500",
};

// "2026-09" -> "سبتمبر 2026"
export function formatMonth(month) {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

// A timestamp -> "24 سبتمبر 2026" in Cairo time
export function formatDay(date) {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }).format(date);
}

export const HOMEWORK_ORDER = ["DONE", "PARTIAL", "NOT_DONE"];

export const HOMEWORK_LABELS = {
  DONE: "عمل الواجب",
  PARTIAL: "ناقص",
  NOT_DONE: "معملوش",
};

export const HOMEWORK_BADGE = {
  DONE: "bg-green-600/15 text-green-600",
  PARTIAL: "bg-amber-500/15 text-amber-600",
  NOT_DONE: "bg-red-600/15 text-red-500",
};

export const HOMEWORK_CHOICE = {
  DONE: "peer-checked:bg-green-600 peer-checked:text-white",
  PARTIAL: "peer-checked:bg-amber-500 peer-checked:text-white",
  NOT_DONE: "peer-checked:bg-red-600 peer-checked:text-white",
};

// 17 -> "17", 17.5 -> "17.5"
export function formatScore(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
