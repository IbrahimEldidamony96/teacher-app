import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClassroomError } from "../src/lib/classroom-errors.js";
import { classroomFailure } from "../src/lib/classroom-http.js";

describe("classroom failure privacy", () => {
  it("records the native SQLSTATE without exposing database details", async (t) => {
    const logger = t.mock.method(console, "error", () => {});
    const error = Object.assign(new Error("private invitation and database query"), {
      name: "PrismaClientKnownRequestError", code: "P2039",
      meta: { driverAdapterError: { cause: {
        originalCode: "08P01", originalMessage: "private student and invitation token",
      } } },
    });
    const response = classroomFailure(error);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "تعذر إكمال الطلب. أعد المحاولة." });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(logger.mock.calls[0].arguments, ["Classroom request failed", {
      name: "PrismaClientKnownRequestError", code: "P2039", databaseCode: "08P01",
    }]);
    assert.equal(JSON.stringify(logger.mock.calls).includes("private student"), false);
  });

  it("does not log arbitrary text presented as a database code", (t) => {
    const logger = t.mock.method(console, "error", () => {});
    classroomFailure({ name: "DatabaseError", code: "P2039", meta: {
      driverAdapterError: { cause: { originalCode: "private-token", originalMessage: "private details" } },
    } });
    assert.deepEqual(logger.mock.calls[0].arguments[1], { name: "DatabaseError", code: "P2039" });
  });

  it("preserves expected classroom errors without database logging", async (t) => {
    const logger = t.mock.method(console, "error", () => {});
    const response = classroomFailure(new ClassroomError("أعد الانضمام للجلسة.", 409));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "أعد الانضمام للجلسة." });
    assert.equal(logger.mock.calls.length, 0);
  });
});
