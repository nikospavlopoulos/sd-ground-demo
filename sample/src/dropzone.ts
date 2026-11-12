/** Operating location. Sunset is derived from these coordinates, never stored. */
export const DROPZONE = {
  name: "Kopaida Dimitra Airfield",
  region: "Boeotia, Central Greece",
  lat: 38.45611, //  38°27'22"N
  lon: 23.13444, //  23°08'04"E
  /** IANA zone, never a fixed offset: Greece runs UTC+3 in jump season, UTC+2 in winter. */
  timeZone: "Europe/Athens",
} as const;

export const AIRCRAFT = { registration: "D-EBNE", type: "Cessna 182" } as const;

