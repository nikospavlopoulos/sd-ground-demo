import { getTimes } from "suncalc";
import { DROPZONE } from "./dropzone.js";
import { athensTime, isoDateToUtcNoon, parseHHMM } from "./time.js";

/**
 * Sunset is derived, never stored: it is a pure function of date and coordinates,
 * so historical days stay correct and moving the dropzone recomputes everything.
 */
export function sunsetLocal(isoDate: string): string | null {
  const { sunset } = getTimes(isoDateToUtcNoon(isoDate), DROPZONE.lat, DROPZONE.lon);
  // suncalc returns null above the polar circles, where the sun may not set at all.
  // Unreachable at 38°N, but threaded through rather than cast away.
  return sunset ? athensTime(sunset) : null;
}

/** Minutes until sunset, negative once it has passed. */
export function minutesToSunset(isoDate: string, now: Date = new Date()): number | null {
  const sunset = parseHHMM(sunsetLocal(isoDate));
  const current = parseHHMM(athensTime(now));
  if (sunset === null || current === null) return null;
  return sunset - current;
}
