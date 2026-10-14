import { validateStudentInput, studentIdentity, studentError } from "@/lib/student-validation";

export const STUDENT_CSV_LIMIT = 200_000;
export const STUDENT_IMPORT_LIMIT = 500;
export const STUDENT_CSV_TEMPLATE = "name,gradeLevel,parentPhone,notes\nSample Student,PRIMARY_1,01000000000,\n";

// RFC 4180 quoting, including commas and newlines inside spreadsheet cells.
export function parseStudentCsv(source) {
  if (typeof source !== "string" || source.length > STUDENT_CSV_LIMIT) {
    throw studentError("ملف CSV لازم يكون أقل من 200 كيلوبايت.");
  }
  const records = [];
  let row = [], cell = "", quoted = false, afterQuote = false;
  const text = source.replace(/^\uFEFF/, "");
  function finishCell() { row.push(cell); cell = ""; afterQuote = false; }
  function finishRow() {
    finishCell();
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
    if (records.length > STUDENT_IMPORT_LIMIT + 1) throw studentError("استورد 500 طالب بحد أقصى في المرة.");
  }
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (character === '"') { quoted = false; afterQuote = true; }
      else cell += character;
    } else if (character === ",") finishCell();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i += 1;
      finishRow();
    } else if (character === '"') {
      if (cell || afterQuote) throw studentError("تنسيق علامات الاقتباس في CSV مش صحيح.");
      quoted = true;
    } else {
      if (afterQuote && character.trim()) throw studentError("فيه نص بعد نهاية خلية مقتبسة.");
      if (!afterQuote) cell += character;
    }
  }
  if (quoted) throw studentError("فيه خلية مقتبسة غير مكتملة في CSV.");
  if (cell || row.length || afterQuote) finishRow();
  if (records.length < 2) throw studentError("أضف أسماء الطلاب بعد صف عناوين الأعمدة.");
  const headers = records.shift().map((value) => value.trim());
  const allowed = ["name", "gradeLevel", "parentPhone", "notes"];
  if (!headers.includes("name") || !headers.includes("gradeLevel") || new Set(headers).size !== headers.length || headers.some((value) => !allowed.includes(value))) {
    throw studentError("عناوين الأعمدة: name,gradeLevel,parentPhone,notes. الاسم والصف مطلوبين.");
  }
  const seen = new Set();
  return records.map((values, index) => {
    const raw = Object.fromEntries(headers.map((key, column) => [key, values[column] ?? ""]));
    const { data, errors } = validateStudentInput(raw);
    if (values.length !== headers.length) errors.push("عدد الخلايا مختلف عن عناوين الأعمدة.");
    const identity = studentIdentity(data);
    if (identity && seen.has(identity)) errors.push("نفس الاسم ورقم ولي الأمر مكرر في الملف.");
    if (identity) seen.add(identity);
    return { row: index + 2, ...data, errors };
  });
}
