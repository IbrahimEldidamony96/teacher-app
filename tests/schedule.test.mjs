import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateKey, overlappingLessons, resolveScheduleForDate, scheduleDates, validateExceptionInput, validateSlotTimes } from "../src/lib/schedule.js";

const group = { id: "group-one", name: "First group" };
const otherGroup = { id: "group-two", name: "Second group" };
const weekly = { id: "weekly-one", groupId: group.id, group, day: "SAT", startTime: "16:00", endTime: "17:00", location: "Room 1" };
const second = { id: "weekly-two", groupId: otherGroup.id, group: otherGroup, day: "SAT", startTime: "17:00", endTime: "18:00" };
const cancellation = { id: "cancel-one", groupId: group.id, group, slotId: weekly.id, date: "2026-10-10", kind: "CANCEL" };

describe("calendar schedule", () => {
  it("cancels one occurrence without removing the recurring session next week", () => {
    const slots = [weekly, second];
    assert.deepEqual(resolveScheduleForDate(slots, [cancellation], "2026-10-10").map((slot) => slot.slotId), [second.id]);
    assert.deepEqual(resolveScheduleForDate(slots, [cancellation], "2026-10-17").map((slot) => slot.slotId), [weekly.id, second.id]);
    assert.equal(weekly.day, "SAT");
  });

  it("moves a single lesson to its replacement date and stores its own location", () => {
    const exception = { ...cancellation, kind: "RESCHEDULE", replacementDate: new Date("2026-10-12T00:00:00.000Z"), startTime: "14:00", endTime: "15:00", location: "Room 2" };
    assert.equal(resolveScheduleForDate([weekly], [exception], "2026-10-10").length, 0);
    const [moved] = resolveScheduleForDate([weekly], [exception], "2026-10-12");
    assert.equal(moved.kind, "RESCHEDULE");
    assert.equal(moved.date, "2026-10-12");
    assert.equal(moved.day, "MON");
    assert.equal(moved.location, "Room 2");
    assert.equal(resolveScheduleForDate([weekly], [exception], "2026-10-17").length, 1);
  });

  it("allows a replacement at a different time on the original day", () => {
    const exception = { ...cancellation, kind: "RESCHEDULE", replacementDate: "2026-10-10", startTime: "18:00", endTime: "19:00" };
    const slots = resolveScheduleForDate([weekly], [exception], "2026-10-10");
    assert.equal(slots.length, 1);
    assert.equal(slots[0].startTime, "18:00");
  });

  it("keeps a dated rescheduled lesson when its weekly slot is deleted", () => {
    const exception = { ...cancellation, slotId: null, kind: "RESCHEDULE", replacementDate: "2026-10-12", startTime: "18:00", endTime: "19:00" };
    const [slot] = resolveScheduleForDate([], [exception], "2026-10-12");
    assert.equal(slot.groupId, group.id);
    assert.equal(slot.startTime, "18:00");
  });

  it("adds a makeup lesson without modifying the recurring week", () => {
    const makeup = { id: "makeup-one", groupId: group.id, group, kind: "MAKEUP", date: "2026-10-11", startTime: "12:00", endTime: "13:00" };
    assert.equal(resolveScheduleForDate([weekly], [makeup], "2026-10-11")[0].kind, "MAKEUP");
    assert.equal(resolveScheduleForDate([weekly], [makeup], "2026-10-10")[0].kind, "WEEKLY");
    assert.equal(resolveScheduleForDate([weekly], [makeup], "2026-10-18").length, 0);
  });

  it("a holiday applies only to its group and date, including dated lessons", () => {
    const holiday = { id: "holiday", groupId: group.id, group, kind: "HOLIDAY", date: new Date("2026-10-10T00:00:00.000Z") };
    const makeup = { id: "makeup", groupId: group.id, group, kind: "MAKEUP", date: "2026-10-10", startTime: "12:00", endTime: "13:00" };
    assert.deepEqual(resolveScheduleForDate([weekly, second], [holiday, makeup], "2026-10-10").map((row) => row.groupId), [otherGroup.id]);
    assert.equal(resolveScheduleForDate([weekly, second], [holiday], "2026-10-17").length, 2);
  });

  it("detects overlap across groups while permitting adjacent lessons", () => {
    assert.equal(overlappingLessons([weekly, second]), null);
    const overlapping = { ...second, startTime: "16:30" };
    assert.equal(overlappingLessons([overlapping, weekly]).length, 2);
    const dates = resolveScheduleForDate([weekly], [{ id: "makeup", groupId: otherGroup.id, group: otherGroup, kind: "MAKEUP", date: "2026-10-10", startTime: "16:30", endTime: "16:45" }], "2026-10-10");
    assert.equal(overlappingLessons(dates).length, 2);
  });

  it("restoring a canceled lesson reveals an overlap with a makeup in the freed time", () => {
    const makeup = { id: "makeup", groupId: otherGroup.id, group: otherGroup, kind: "MAKEUP", date: "2026-10-10", startTime: "16:00", endTime: "17:00" };
    assert.equal(overlappingLessons(resolveScheduleForDate([weekly], [cancellation, makeup], "2026-10-10")), null);
    assert.ok(overlappingLessons(resolveScheduleForDate([weekly], [makeup], "2026-10-10")));
  });

  it("generates exact inclusive dates over month and year boundaries", () => {
    assert.deepEqual(scheduleDates("2026-12-30", 4), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    assert.equal(scheduleDates("2026-10-10").length, 14);
    assert.equal(dateKey(new Date("2026-10-10T00:00:00.000Z")), "2026-10-10");
    assert.throws(() => scheduleDates("2026-02-30"));
    assert.throws(() => scheduleDates("2026-10-10", 0));
  });

  it("rejects malformed times, past dates, invalid dates and missing source slots", () => {
    for (const times of [{ startTime: "16:00", endTime: "16:00" }, { startTime: "18:00", endTime: "17:00" }, { startTime: "8:00", endTime: "09:00" }, { startTime: "23:00", endTime: "24:00" }]) {
      assert.throws(() => validateSlotTimes(times));
    }
    assert.doesNotThrow(() => validateSlotTimes({ startTime: "08:00", endTime: "09:00" }));
    assert.doesNotThrow(() => validateExceptionInput(cancellation, "2026-10-09"));
    assert.throws(() => validateExceptionInput({ ...cancellation, date: "2026-10-08" }, "2026-10-09"));
    assert.throws(() => validateExceptionInput({ ...cancellation, date: "2026-02-30" }, "2026-01-01"));
    assert.throws(() => validateExceptionInput({ ...cancellation, slotId: "" }, "2026-10-09"));
    assert.throws(() => validateExceptionInput({ ...cancellation, kind: "UNKNOWN" }, "2026-10-09"));
    assert.throws(() => validateExceptionInput({ ...cancellation, kind: "HOLIDAY" }, "2026-10-09"));
    assert.throws(() => validateExceptionInput({ ...cancellation, kind: "RESCHEDULE", replacementDate: "2026-10-08", startTime: "12:00", endTime: "13:00" }, "2026-10-09"));
  });
});
