/**
 * A day is uniquely identified by its date, so its id is derived from it rather
 * than randomly generated. Two devices that each create the same operating day
 * while offline then produce the SAME row instead of colliding on op_date's
 * UNIQUE constraint when they sync.
 */
export const dayIdFor = (opDate: string): string => `day-${opDate}`;

export interface CrewMember {
  id: string;
  displayName: string;
  normalizedName: string;
  isFixed: boolean;
}

export interface Flight {
  id: string;
  dayId: string;
  seq: number;
  takeoffLocal: string | null;
  landingLocal: string | null;
  crewId: string | null;
  updatedAt: number;
  deletedAt: number | null;
}

export interface FuelEvent {
  id: string;
  dayId: string;
  /** Load this uplift happened at. Null only in historical rows — both write paths reject it now. */
  atLoadSeq: number | null;
  leftL: number;
  rightL: number;
  crewId: string | null;
  updatedAt: number;
  deletedAt: number | null;
}

export interface OperatingDay {
  id: string;
  opDate: string; // 'YYYY-MM-DD'
  aircraftId: string;
  /** Crew member who started the day. Others see it read-only. null = unclaimed. */
  ownerCrewId: string | null;
  closedAt: number | null;
  notes: string | null;
  updatedAt: number;
}

export interface DayBundle {
  day: OperatingDay;
  flights: Flight[];
  fuel: FuelEvent[];
}

export interface DayTotals {
  loads: number;
  airborneMinutes: number;
  fuelLitres: number;
  /** null when nothing was uplifted or nothing flew — an unknown average, not a zero one. */
  litresPerLoad: number | null;
  /** null when nothing has flown yet — dividing by zero flight hours is meaningless. */
  litresPerFlightHour: number | null;
}

/**
 * One load, as a report renders it.
 *
 * Derived like everything else: the duration comes from the same
 * `durationMinutes` the Today screen uses, so a report and the screen it
 * describes cannot disagree.
 */
export interface ReportFlight {
  seq: number;
  takeoffLocal: string | null;
  landingLocal: string | null;
  durationMinutes: number | null;
  /** Litres uplifted at this load. null means no uplift — not zero litres. */
  fuelLitres: number | null;
}

export interface DayReport extends DayTotals {
  opDate: string;
  closed: boolean;
  /**
   * Who held the shift. Only that person can log a load — the server rejects
   * anyone else — so one name covers the whole day. Null only where an owner was
   * cleared by hand; see docs/operations.md.
   */
  crewName: string | null;
  aircraftId: string;
  /** Only on /day/:date. Month and range carry sums, not loads. */
  flights?: ReportFlight[];
}

export interface RangeReport extends DayTotals {
  from: string;
  to: string;
  days: DayReport[];
}

/** One queued offline mutation. `id` is the entity UUID, which makes replay idempotent. */
export type SyncOp =
  | { kind: "day"; payload: OperatingDay }
  | { kind: "flight"; payload: Flight }
  | { kind: "fuel"; payload: FuelEvent };
