import { durationMinutes } from "./time.js";
import type { DayTotals, Flight, FuelEvent, ReportFlight } from "./types.js";

const live = <T extends { deletedAt: number | null }>(rows: readonly T[]): T[] =>
  rows.filter((r) => r.deletedAt === null);

export const fuelTotal = (event: Pick<FuelEvent, "leftL" | "rightL">): number =>
  event.leftL + event.rightL;

/** Tanks are normally filled to matching amounts; a mismatch is worth confirming. */
export const tanksMatch = (leftL: number, rightL: number): boolean => leftL === rightL;

export function flightDuration(flight: Pick<Flight, "takeoffLocal" | "landingLocal">): number | null {
  return durationMinutes(flight.takeoffLocal, flight.landingLocal);
}

/**
 * Totals are always derived, never stored. The same function runs on the phone
 * (optimistically, against IndexedDB) and on the Worker (authoritatively, against
 * D1) — two implementations would drift and a day's totals would change on sync.
 */
export function computeTotals(flights: readonly Flight[], fuel: readonly FuelEvent[]): DayTotals {
  const liveFlights = live(flights);
  const liveFuel = live(fuel);

  const airborneMinutes = liveFlights.reduce((sum, f) => sum + (flightDuration(f) ?? 0), 0);
  const fuelLitres = liveFuel.reduce((sum, e) => sum + fuelTotal(e), 0);

  return {
    loads: liveFlights.length,
    airborneMinutes,
    fuelLitres: round1(fuelLitres),
    litresPerLoad: fuelPerLoad(fuelLitres, liveFlights.length),
    litresPerFlightHour: burnRate(fuelLitres, airborneMinutes),
  };
}

/**
 * Whether the dropzone actually worked that day.
 *
 * A load is the only thing that can start a day: fuel is entered from a load's
 * row, so neither a time nor a refuel can exist without one. A day whose loads
 * were all deleted is a stray tap, not an operating day — it must not be
 * announced, and must not appear in a report.
 */
export function dayOperated(flights: readonly Flight[]): boolean {
  return live(flights).length > 0;
}

export function sumTotals(parts: readonly DayTotals[]): DayTotals {
  const loads = parts.reduce((s, p) => s + p.loads, 0);
  const airborneMinutes = parts.reduce((s, p) => s + p.airborneMinutes, 0);
  const fuelLitres = parts.reduce((s, p) => s + p.fuelLitres, 0);
  return {
    loads,
    airborneMinutes,
    fuelLitres: round1(fuelLitres),
    litresPerLoad: fuelPerLoad(fuelLitres, loads),
    litresPerFlightHour: burnRate(fuelLitres, airborneMinutes),
  };
}

/**
 * Litres per flight hour, or null when the figure would be meaningless.
 *
 * Both halves are required: a day that flew but recorded no uplift has an
 * *unknown* burn rate, not a zero one, and rendering "0 L/h" would read as
 * "the aircraft burned nothing".
 */
function burnRate(fuelLitres: number, airborneMinutes: number): number | null {
  if (fuelLitres <= 0 || airborneMinutes <= 0) return null;
  return round1(fuelLitres / (airborneMinutes / 60));
}

/**
 * Average uplift per load, or null when the figure would be meaningless.
 *
 * Same rule as the burn rate above, for the same reason: a day that flew without
 * a recorded uplift has an *unknown* average, and "0 L" would read as a
 * measurement. Across a range this is sum(fuel) / sum(loads) rather than the mean
 * of per-day averages, because `sumTotals` hands it the summed primitives.
 */
function fuelPerLoad(fuelLitres: number, loads: number): number | null {
  if (fuelLitres <= 0 || loads <= 0) return null;
  return round1(fuelLitres / loads);
}

/**
 * The uplift recorded at a load.
 *
 * Most recent wins: rows predating the one-uplift-per-load rule may still hold
 * duplicates. Shared rather than written per surface, so the JSON reports, the
 * CSV and the shared image cannot disagree about which load a refuel belongs to.
 */
export const upliftAt = (fuel: readonly FuelEvent[], seq: number): FuelEvent | undefined =>
  fuel.filter((f) => f.atLoadSeq === seq).sort((a, b) => b.updatedAt - a.updatedAt)[0];

/**
 * One row per live load, as a report or the shared image renders it.
 *
 * The duration comes from the same `durationMinutes` the Today screen uses, so a
 * report, an image and the screen they describe cannot disagree.
 */
export function toReportFlights(
  flights: readonly Flight[],
  fuel: readonly FuelEvent[],
): ReportFlight[] {
  const liveFuel = live(fuel);
  return live(flights).map((f) => {
    const uplift = upliftAt(liveFuel, f.seq);
    return {
      seq: f.seq,
      takeoffLocal: f.takeoffLocal,
      landingLocal: f.landingLocal,
      durationMinutes: durationMinutes(f.takeoffLocal, f.landingLocal),
      fuelLitres: uplift ? fuelTotal(uplift) : null,
    };
  });
}

/** Next load number. A soft-deleted load frees its seq, so this reads live rows only. */
export function nextSeq(flights: readonly Flight[]): number {
  const seqs = live(flights).map((f) => f.seq);
  return seqs.length === 0 ? 1 : Math.max(...seqs) + 1;
}

/** Only the highest live load may be removed — deleting a middle one would leave a hole. */
export function isDeletableSeq(flights: readonly Flight[], seq: number): boolean {
  const seqs = live(flights).map((f) => f.seq);
  return seqs.length > 0 && Math.max(...seqs) === seq;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
