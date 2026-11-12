import { describe, expect, it } from "vitest";
import { minutesToSunset, sunsetLocal } from "../src/sunset.js";

// Pinned for Kopaida Dimitra Airfield (38.45611, 23.13444).
describe("sunsetLocal", () => {
  it("matches known sunsets across the year", () => {
    expect(sunsetLocal("2026-03-21")).toBe("18:40");
    expect(sunsetLocal("2026-06-21")).toBe("20:54");
    expect(sunsetLocal("2026-09-21")).toBe("19:26");
    expect(sunsetLocal("2026-12-21")).toBe("17:09");
  });

  it("steps back an hour across the October DST changeover", () => {
    // 2026-10-25 is when Greece leaves EEST. A fixed UTC offset would miss this.
    expect(sunsetLocal("2026-10-24")).toBe("18:37");
    expect(sunsetLocal("2026-10-26")).toBe("17:34");
  });

  it("puts the summer solstice later than the winter solstice", () => {
    const summer = sunsetLocal("2026-06-21");
    const winter = sunsetLocal("2026-12-21");
    expect(summer).not.toBeNull();
    expect(winter).not.toBeNull();
    expect(summer! > winter!).toBe(true);
  });

  it("never returns null at this latitude", () => {
    // The nullable return exists for polar latitudes; 38°N always has a sunset.
    for (const date of ["2026-01-01", "2026-06-21", "2026-12-21"]) {
      expect(sunsetLocal(date)).not.toBeNull();
    }
  });
});

describe("minutesToSunset", () => {
  it("counts down to sunset", () => {
    // 15:26 Athens on a day with a 19:26 sunset -> exactly four hours.
    expect(minutesToSunset("2026-09-21", new Date("2026-09-21T12:26:00Z"))).toBe(240);
  });

  it("goes negative once sunset has passed", () => {
    expect(minutesToSunset("2026-09-21", new Date("2026-09-21T17:26:00Z"))).toBe(-60);
  });
});
