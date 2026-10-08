// Current weekday ("SAT".."FRI") and time ("HH:mm") in Cairo, whatever the server's time zone is
export function cairoNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    day: get("weekday").toUpperCase().slice(0, 3),
    time: `${get("hour")}:${get("minute")}`,
  };
}

// Today's date in Cairo as "YYYY-MM-DD"
export function cairoToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// "2026-09-24" is valid only if it is a real calendar date
export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// The value stored in @db.Date columns: UTC midnight of that calendar day
export function toDbDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function weekdayOf(value) {
  return WEEKDAYS[toDbDate(value).getUTCDay()];
}

// "YYYY-MM" of a Date, in Cairo time
export function cairoMonthOf(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

export function cairoMonth() {
  return cairoToday().slice(0, 7);
}

export function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// shiftMonth("2026-12", 1) -> "2027-01"
export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// The given month and the n-1 before it, newest first
export function lastMonths(month, n) {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, -i));
}
