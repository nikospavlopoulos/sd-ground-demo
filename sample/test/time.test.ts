import { describe, expect, it } from "vitest";
import {
  athensDate, athensTime, checkLoadTimes, durationMinutes, formatDuration,
  formatHHMM, LOAD_MINUTES, parseHHMM,
} from "../src/time.js";

describe("parseHHMM", () => {
  it("parses valid 24-hour times", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("09:42")).toBe(582);
    expect(parseHHMM("23:59")).toBe(1439);
  });

  it("rejects malformed or out-of-range input", () => {
    for (const bad of ["", "9:4", "24:00", "12:60", "abc", null, undefined]) {
      expect(parseHHMM(bad)).toBeNull();
    }
  });
});

describe("durationMinutes", () => {
  it("computes airborne time", () => {
    expect(durationMinutes("09:42", "09:58")).toBe(16);
    expect(durationMinutes("11:20", "11:37")).toBe(17);
  });

  it("treats a landing before the takeoff as crossing midnight, not as negative", () => {
    expect(durationMinutes("23:50", "00:10")).toBe(20);
  });

  it("returns null when either end is missing", () => {
    expect(durationMinutes("09:42", null)).toBeNull();
    expect(durationMinutes(null, "09:58")).toBeNull();
  });
});

describe("checkLoadTimes", () => {
  it("passes an ordinary load", () => {
    expect(checkLoadTimes("09:42", "10:05", "landing")).toEqual({ kind: "ok" });
  });

  it("says nothing about half a pair, which is the normal state mid-load", () => {
    expect(checkLoadTimes("09:42", null, "landing")).toEqual({ kind: "incomplete" });
    expect(checkLoadTimes(null, "10:05", "takeoff")).toEqual({ kind: "incomplete" });
    expect(checkLoadTimes(null, null, "takeoff")).toEqual({ kind: "incomplete" });
  });

  it("blames the field that is probably wrong, not the one being edited", () => {
    // Setting a landing earlier than the takeoff usually means the takeoff is bad.
    expect(checkLoadTimes("14:00", "09:30", "landing")).toEqual({ kind: "backwards", blame: "takeoff" });
    // And the other way round, when a takeoff is dragged past an existing landing.
    expect(checkLoadTimes("14:00", "09:30", "takeoff")).toEqual({ kind: "backwards", blame: "landing" });
  });

  it("does not inherit the midnight wrap it exists to expose", () => {
    // durationMinutes answers 1410 here, which renders as 23h 30m and looks like
    // a real day. Asking it whether a pair is backwards would always answer no.
    expect(durationMinutes("14:00", "13:30")).toBe(1410);
    expect(checkLoadTimes("14:00", "13:30", "landing").kind).toBe("backwards");
  });

  it("flags the production case: two NOW taps inside one minute", () => {
    expect(checkLoadTimes("13:19", "13:19", "landing"))
      .toEqual({ kind: "suspect", reason: "zero", minutes: 0 });
  });

  it("flags too short and too long, and passes exactly on each threshold", () => {
    expect(checkLoadTimes("09:00", "09:09", "landing"))
      .toEqual({ kind: "suspect", reason: "short", minutes: 9 });
    expect(checkLoadTimes("09:00", "09:46", "landing"))
      .toEqual({ kind: "suspect", reason: "long", minutes: 46 });
    // The numbers are limits, not targets: a load of exactly either is fine.
    expect(checkLoadTimes("09:00", "09:10", "landing")).toEqual({ kind: "ok" });
    expect(checkLoadTimes("09:00", "09:45", "landing")).toEqual({ kind: "ok" });
  });

  it("keeps both thresholds outside the range the dropzone actually flies", () => {
    // A check that fires on a normal load gets dismissed, and a dismissed check
    // teaches the habit of tapping through. Loads under 15 minutes are already
    // rare; even a long, delayed one does not pass 40.
    expect(LOAD_MINUTES.min).toBeLessThan(15);
    expect(LOAD_MINUTES.max).toBeGreaterThan(40);
  });
});

describe("Athens local time", () => {
  // Workers run in UTC. These assert the offset is applied, and that it changes
  // with DST rather than being pinned to +2 or +3.
  it("applies EEST (UTC+3) during jump season", () => {
    const at = new Date("2026-06-21T12:00:00Z");
    expect(athensTime(at)).toBe("15:00");
    expect(athensDate(at)).toBe("2026-06-21");
  });

  it("applies EET (UTC+2) in winter", () => {
    expect(athensTime(new Date("2026-12-21T12:00:00Z"))).toBe("14:00");
  });

  it("rolls the local date forward late in the UTC evening", () => {
    expect(athensDate(new Date("2026-06-21T22:30:00Z"))).toBe("2026-06-22");
  });
});

describe("formatting", () => {
  it("formats minutes as HH:MM and wraps at midnight", () => {
    expect(formatHHMM(582)).toBe("09:42");
    expect(formatHHMM(1440)).toBe("00:00");
    expect(formatHHMM(-30)).toBe("23:30");
  });

  it("formats durations", () => {
    expect(formatDuration(16)).toBe("16m");
    expect(formatDuration(72)).toBe("1h 12m");
    expect(formatDuration(-5)).toBe("0m");
  });
});
