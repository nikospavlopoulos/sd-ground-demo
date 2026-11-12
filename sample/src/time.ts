import { DROPZONE } from "./dropzone.js";

const TZ = DROPZONE.timeZone;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Calendar date at the airfield, 'YYYY-MM-DD'. Workers run in UTC; this is the only date that means anything here. */
export function athensDate(at: Date = new Date()): string {
  return dateFmt.format(at);
}

/** Wall-clock time at the airfield, 'HH:MM', 24-hour. */
export function athensTime(at: Date = new Date()): string {
  return timeFmt.format(at);
}

/** 'HH:MM' -> minutes since midnight. Returns null for anything unparseable. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Airborne minutes. A landing earlier than the takeoff is read as crossing
 * midnight rather than as a negative duration.
 */
export function durationMinutes(
  takeoff: string | null | undefined,
  landing: string | null | undefined,
): number | null {
  const t = parseHHMM(takeoff);
  const l = parseHHMM(landing);
  if (t === null || l === null) return null;
  return l >= t ? l - t : l + 1440 - t;
}

/**
 * Outside this range a load is not something this dropzone flies.
 *
 * Both numbers sit well outside the normal band rather than at its edge: a load
 * under 15 minutes is already rare even in a fast aircraft, and even a long,
 * delayed one does not pass 35-40. Ten and forty-five therefore catch wild values
 * without crying wolf — and a check that cries wolf gets dismissed, which teaches
 * the habit of tapping through. See ADR-0023.
 */
export const LOAD_MINUTES = { min: 10, max: 45 } as const;

export type TimePairVerdict =
  /** Both times present and plausible. */
  | { kind: "ok" }
  /** Half a pair, which is the normal state mid-load. Nothing to check yet. */
  | { kind: "incomplete" }
  /** The row contradicts itself. `blame` is the field that is probably wrong. */
  | { kind: "backwards"; blame: "takeoff" | "landing" }
  | { kind: "suspect"; reason: "zero" | "short" | "long"; minutes: number };

/**
 * Whether a load's two times contradict each other, or merely look wrong.
 *
 * `editing` is the end the crew just changed, and `blame` is deliberately the
 * *other* one: setting a landing earlier than its takeoff almost always means the
 * takeoff is the bad value, so naming the field being edited would send someone to
 * correct the one number they just got right.
 *
 * Production is why this exists at all. Two loads were logged at 13:19 -> 13:19,
 * one taking off the minute the previous landed, because somebody caught up on a
 * forgotten log by tapping NOW twice — and nothing said a word.
 */
export function checkLoadTimes(
  takeoff: string | null | undefined,
  landing: string | null | undefined,
  editing: "takeoff" | "landing",
): TimePairVerdict {
  const t = parseHHMM(takeoff);
  const l = parseHHMM(landing);
  if (t === null || l === null) return { kind: "incomplete" };

  // Raw difference, deliberately NOT durationMinutes(): asking the function that
  // reads a backwards pair as a midnight crossing whether a pair is backwards
  // would always answer no.
  const minutes = l - t;

  if (minutes < 0) {
    return { kind: "backwards", blame: editing === "takeoff" ? "landing" : "takeoff" };
  }
  if (minutes === 0) return { kind: "suspect", reason: "zero", minutes };
  if (minutes < LOAD_MINUTES.min) return { kind: "suspect", reason: "short", minutes };
  if (minutes > LOAD_MINUTES.max) return { kind: "suspect", reason: "long", minutes };
  return { kind: "ok" };
}

/** '1h 12m' / '47m'. Used for both flight durations and time-to-sunset. */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 'YYYY-MM-DD' -> 'Sun 21/09/2026' for display. */
export function formatDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${isoDate}T12:00:00Z`));
  return `${weekday} ${d}/${m}/${y}`;
}

export function isoDateToUtcNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}
