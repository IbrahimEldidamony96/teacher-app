export function normalizeStudentName(name) {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeParentPhone(phone) {
  const digits = (phone ?? "")
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s()+-]/gu, "");

  if (!digits) return null;
  if (/^00201\d{9}$/.test(digits)) return digits.slice(2);
  if (/^01\d{9}$/.test(digits)) return `20${digits.slice(1)}`;
  if (/^1\d{9}$/.test(digits)) return `20${digits}`;
  return digits;
}
