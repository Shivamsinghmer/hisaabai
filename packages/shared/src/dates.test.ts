import { describe, expect, it } from "vitest";
import { addDays, resolveDate, todayIst } from "./dates.js";

// Saturday 31 Oct 2026, 10:00 IST
const now = new Date("2026-10-31T04:30:00Z");
const future = { now, direction: "future" as const };
const past = { now, direction: "past" as const };

describe("todayIst", () => {
  it("uses India time, not UTC", () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in India.
    expect(todayIst(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("resolveDate — relative words", () => {
  it.each([
    ["aaj de dunga", "2026-10-31"],
    ["kal dunga", "2026-11-01"],
    ["parso tak", "2026-11-02"],
    ["5 din mein", "2026-11-05"],
    ["do din baad", "2026-11-02"],
    ["agle hafte", "2026-11-07"],
    ["agle mahine", "2026-11-30"],
  ])("future: %s → %s", (text, expected) => {
    expect(resolveDate(text, future)).toBe(expected);
  });

  it.each([
    ["kal liya tha", "2026-10-30"],
    ["parso", "2026-10-29"],
    ["3 din pehle", "2026-10-28"],
  ])("past: %s → %s", (text, expected) => {
    expect(resolveDate(text, past)).toBe(expected);
  });

  it("defaults to future", () => {
    expect(resolveDate("kal", { now })).toBe("2026-11-01");
  });
});

describe("resolveDate — weekdays", () => {
  it.each([
    ["Friday ko dunga", "2026-11-06"],
    ["Friday tak", "2026-11-06"],
    ["somvar", "2026-11-02"],
    ["shanivar ko", "2026-11-07"], // today is Saturday → next Saturday
  ])("future: %s → %s", (text, expected) => {
    expect(resolveDate(text, future)).toBe(expected);
  });

  it("past weekday is the last one before today", () => {
    expect(resolveDate("monday ko liya", past)).toBe("2026-10-26");
  });
});

describe("resolveDate — written dates (khata)", () => {
  it.each([
    ["12/9", past, "2026-09-12"],
    ["12 Sep", past, "2026-09-12"],
    ["5/11", future, "2026-11-05"],
    ["12/9", future, "2027-09-12"],
    ["3/1/27", future, "2027-01-03"],
    ["15-08-2026", past, "2026-08-15"],
  ])("%s (%o) → %s", (text, opts, expected) => {
    expect(resolveDate(text, opts)).toBe(expected);
  });

  it("rejects impossible dates", () => {
    expect(resolveDate("31/2/2026", past)).toBeNull();
  });

  it("returns null when there is no date", () => {
    expect(resolveDate("Gupta ji 120 udhaar", future)).toBeNull();
  });
});
