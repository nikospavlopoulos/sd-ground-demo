import { describe, expect, it } from "vitest";
import { computeTotals, dayOperated, isDeletableSeq, nextSeq, sumTotals, tanksMatch } from "../src/totals.js";
import type { Flight, FuelEvent } from "../src/types.js";

const flight = (seq: number, takeoff: string | null, landing: string | null, deleted = false): Flight => ({
  id: `f${seq}`, dayId: "d", seq, takeoffLocal: takeoff, landingLocal: landing,
  crewId: null, updatedAt: 0, deletedAt: deleted ? 1 : null,
});

const fuel = (atLoadSeq: number | null, leftL: number, rightL: number, deleted = false): FuelEvent => ({
  id: `u${atLoadSeq}`, dayId: "d", atLoadSeq, leftL, rightL,
  crewId: null, updatedAt: 0, deletedAt: deleted ? 1 : null,
});

describe("computeTotals", () => {
  it("totals a back-to-back day where one uplift covers two loads", () => {
    const totals = computeTotals(
      [flight(1, "09:42", "09:58"), flight(2, "10:15", "10:31"), flight(3, "10:44", "11:01")],
      [fuel(2, 85, 80)],
    );
    expect(totals).toEqual({
      loads: 3, airborneMinutes: 49, fuelLitres: 165, litresPerLoad: 55, litresPerFlightHour: 202,
    });
  });

  it("ignores soft-deleted rows", () => {
    const totals = computeTotals([flight(1, "09:00", "09:20"), flight(2, "10:00", "10:30", true)],
      [fuel(1, 30, 30), fuel(2, 50, 50, true)]);
    expect(totals.loads).toBe(1);
    expect(totals.airborneMinutes).toBe(20);
    expect(totals.fuelLitres).toBe(60);
  });

  it("reports an unknown burn rate rather than zero when nothing was uplifted", () => {
    // 0 L/h would read as "the aircraft burned nothing"; the truth is we do not know.
    expect(computeTotals([flight(1, "09:42", "09:58")], []).litresPerFlightHour).toBeNull();
  });

  it("reports an unknown burn rate when fuel was uplifted but nothing flew", () => {
    expect(computeTotals([flight(1, null, null)], [fuel(null, 40, 40)]).litresPerFlightHour).toBeNull();
  });

  it("counts a load with no times recorded yet", () => {
    expect(computeTotals([flight(1, null, null)], []).loads).toBe(1);
  });

  it("reports an unknown fuel per load rather than zero when nothing was uplifted", () => {
    // Same rule as the burn rate: "0 L" would read as "the aircraft took nothing".
    expect(computeTotals([flight(1, "09:42", "09:58")], []).litresPerLoad).toBeNull();
  });

  it("reports an unknown fuel per load when there is no load to divide by", () => {
    expect(computeTotals([], [fuel(null, 40, 40)]).litresPerLoad).toBeNull();
  });

  it("divides by loads, not by flights that actually flew", () => {
    // A load with no times still consumed its share of the uplift.
    expect(computeTotals([flight(1, "09:00", "09:30"), flight(2, null, null)], [fuel(1, 30, 30)])
      .litresPerLoad).toBe(30);
  });
});

describe("sumTotals", () => {
  it("recomputes the burn rate across days rather than averaging per-day rates", () => {
    const a = computeTotals([flight(1, "09:00", "10:00")], [fuel(1, 50, 50)]); // 100 L/h
    const b = computeTotals([flight(1, "09:00", "12:00")], [fuel(1, 100, 100)]); // 66.7 L/h
    // 300 L over 4 h = 75 L/h, not the mean of 100 and 66.7.
    expect(sumTotals([a, b]).litresPerFlightHour).toBe(75);
  });

  it("recomputes fuel per load across days rather than averaging per-day averages", () => {
    const a = computeTotals([flight(1, "09:00", "10:00")], [fuel(1, 50, 50)]);   // 100 L, 1 load
    const b = computeTotals(
      [flight(1, "09:00", "09:20"), flight(2, "10:00", "10:20"), flight(3, "11:00", "11:20")],
      [fuel(1, 100, 100)],                                                        // 200 L, 3 loads
    );
    expect(a.litresPerLoad).toBe(100);
    expect(b.litresPerLoad).toBe(66.7);
    // 300 L over 4 loads = 75, not the mean of 100 and 66.7.
    expect(sumTotals([a, b]).litresPerLoad).toBe(75);
  });
});

describe("load numbering", () => {
  it("starts at 1 and increments", () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq([flight(1, null, null), flight(2, null, null)])).toBe(3);
  });

  it("frees the number of a soft-deleted load", () => {
    expect(nextSeq([flight(1, null, null), flight(2, null, null, true)])).toBe(2);
  });

  it("allows deleting only the highest live load", () => {
    const flights = [flight(1, null, null), flight(2, null, null)];
    expect(isDeletableSeq(flights, 2)).toBe(true);
    expect(isDeletableSeq(flights, 1)).toBe(false);
    expect(isDeletableSeq([], 1)).toBe(false);
  });
});

describe("dayOperated", () => {
  it("is false for a day that never had a load", () => {
    expect(dayOperated([])).toBe(false);
  });

  it("is false once every load has been deleted again", () => {
    // The stray-tap case: a row exists, but nothing flew.
    expect(dayOperated([flight(1, null, null, true)])).toBe(false);
  });

  it("is true for a load that exists, even with no times or fuel yet", () => {
    // The load is the commitment; times and fuel arrive later in the day.
    expect(dayOperated([flight(1, null, null)])).toBe(true);
  });
});

describe("tanksMatch", () => {
  it("is the rule behind the confirm prompt", () => {
    expect(tanksMatch(30, 30)).toBe(true);
    expect(tanksMatch(30, 45)).toBe(false);
  });
});
