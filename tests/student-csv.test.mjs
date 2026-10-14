import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStudentCsv } from "../src/lib/student-csv.js";

describe("spreadsheet student validation", () => {
  it("accepts BOM, quoted commas/newlines, Arabic grades and normalized phones", () => {
    const rows = parseStudentCsv('\uFEFFname,gradeLevel,studentPhone,notes\r\n"Test, Student",أولى ابتدائي,٠١٠٠٠٠٠٠٠٠١,"Line one\nLine ""two"""\r\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Test, Student");
    assert.equal(rows[0].gradeLevel, "PRIMARY_1");
    assert.equal(rows[0].studentPhone, "201000000001");
    assert.equal(rows[0].notes, 'Line one\nLine "two"');
    assert.deepEqual(rows[0].errors, []);
  });
  it("reports invalid fields and duplicate identities before any import", () => {
    const rows = parseStudentCsv("name,gradeLevel,studentPhone\nTest Student,PRIMARY_1,01000000001\n test  student ,PRIMARY_2,+201000000001\n,WRONG,abc\n");
    assert.equal(rows[0].errors.length, 0);
    assert.equal(rows[1].errors.length, 1);
    assert.equal(rows[2].errors.length, 3);
  });
  it("rejects broken quoting, missing/duplicate headers and oversized batches", () => {
    for (const csv of ['name,gradeLevel\n"Open,PRIMARY_1', 'name,name\nOne,Two', 'notes\nText', 'name,gradeLevel\n"Test"oops,PRIMARY_1']) assert.throws(() => parseStudentCsv(csv));
    assert.throws(() => parseStudentCsv("name,gradeLevel\n" + Array.from({ length: 501 }, (_, index) => `Test ${index},PRIMARY_1`).join("\n")));
  });
});
