import airportsData from './assets/airports.json';

export interface AirportCoords {
  lat: number;
  lon: number;
}

interface AirportRecord {
  ident: string | null;
  iata: string | null;
  icao: string | null;
  lat: number;
  lon: number;
  /** IANA zone name, e.g. "Asia/Almaty". Derived from the coordinates when the dataset was built. */
  tz: string | null;
}

const byIata = new Map<string, AirportRecord>();
const byIcao = new Map<string, AirportRecord>();

for (const record of airportsData as AirportRecord[]) {
  if (record.iata) byIata.set(record.iata.toUpperCase(), record);

  // ~300 records carry no `icao` but their `ident` is already an ICAO code (the source dataset
  // uses `ident` as the primary key and only fills `icao` when it differs).
  const icao = record.icao?.toUpperCase() ?? record.ident?.toUpperCase();
  if (icao) byIcao.set(icao, record);
}

/**
 * Codes the bundled dataset can't resolve on its own, checked before it.
 *
 * Two distinct causes, both real:
 *  - an IATA code was retired, so the dataset only knows the airport by its replacement;
 *  - the dataset itself is wrong or stale for that airport.
 *
 * This only ever redirects a *lookup*. The code the crew member flew under is what stays in the
 * logbook: a roster that says TSE keeps saying TSE, it just finds Astana's coordinates and
 * timezone. The list is deliberately short and evidenced rather than a guess at every code
 * change since 2016 — anything not covered here is reported unresolved so it surfaces for
 * checking instead of passing silently.
 */
const LOOKUP_ALIASES: Record<string, string> = {
  // Astana. IATA TSE was retired in 2020 when the airport was renamed; the dataset carries it
  // only as NQZ, so a roster from before the change would otherwise miss.
  TSE: 'NQZ',
  // Bishkek Manas. The dataset record is wrong — it lists IATA "BSZ", but Manas is FRU.
  FRU: 'UCFM',
  // ...and the same airport's ICAO moved when Kyrgyzstan was allocated the UC** block.
  UAFM: 'UCFM',
};

function findRecord(code: string): AirportRecord | undefined {
  const normalized = code.trim().toUpperCase();
  const target = LOOKUP_ALIASES[normalized] ?? normalized;
  // ICAO first: codes are 4 letters and IATA are 3, so the two namespaces can't collide.
  return byIcao.get(target) ?? byIata.get(target);
}

/** True when the code is one the app can place on the globe — i.e. one it can compute hours for. */
export function isKnownAirport(code: string): boolean {
  return findRecord(code) !== undefined;
}

/** Looks up an airport's coordinates by IATA (3-letter) or ICAO (4-letter) code. */
export function findAirportCoords(code: string): AirportCoords | undefined {
  const record = findRecord(code);
  return record ? { lat: record.lat, lon: record.lon } : undefined;
}

/**
 * The airport's IANA timezone, e.g. "Asia/Almaty".
 *
 * This is what makes a cabin-crew roster computable at all. The report states its times "in
 * Local Station", so a sector's block time is not the difference between two clock readings —
 * ALA 23:55 to ICN 09:39 is 5h44, not 9h44 — and neither the block time nor the night hours can
 * be derived without knowing both stations' offsets on that date, DST included.
 */
export function findAirportTimezone(code: string): string | undefined {
  return findRecord(code)?.tz ?? undefined;
}
