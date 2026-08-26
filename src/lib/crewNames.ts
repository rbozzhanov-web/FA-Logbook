/**
 * The crew names already in the logbook, most-flown-with first.
 *
 * Nothing new is stored: the names come from the entries themselves, so the list maintains itself
 * as sectors are added and can never drift from what is actually recorded. Frequency drives the
 * order because cabin crew fly with the same handful of people repeatedly — the name typed twenty
 * times should be the first suggestion, not the one that happens to sort earliest.
 */
/**
 * Just the name columns, and `null` alongside `undefined` so a raw SQLite row satisfies this as
 * readily as a `CabinCrewLogEntry` does.
 */
export interface CrewFields {
  captainName?: string | null;
  purserName?: string | null;
  otherCrewNames?: string | null;
}

/** A rank code, and the deadhead tag that can follow it, at the head of a crew-list name. */
const RANK_PREFIX_RE = /^[A-Z]{2,3}(\s*\(DHC\))?\s+/;

/** Splits a stored crew list into bare names, dropping the rank each one is prefixed with. */
export function splitCrewList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim().replace(RANK_PREFIX_RE, '').trim())
    .filter((part) => part.length > 0);
}

export function collectCrewNames(entries: CrewFields[]): string[] {
  const counts = new Map<string, { name: string; count: number }>();

  // `null` as well as `undefined`: SQLite hands back null for an empty column.
  const record = (raw: string | null | undefined) => {
    const name = raw?.trim();
    if (!name) return;
    // Case-insensitive key so "Kisselev" and "KISSELEV" are one person, but the first spelling
    // seen is what gets offered — reports are upper-case and re-casing someone's name is not ours
    // to do.
    const key = name.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { name, count: 1 });
  };

  for (const entry of entries) {
    record(entry.captainName);
    record(entry.purserName);
    // The other-crew column holds a whole cabin's worth of people, imported as one comma-joined
    // list with each name carrying its rank ("PU SATKALIYEVA NAZIMA", "FJ (DHC) MAUT AISHA").
    // Recording it whole would offer the entire crew list back as a single suggestion, so it is
    // split and the rank prefix trimmed off — the name is what gets typed.
    for (const name of splitCrewList(entry.otherCrewNames)) record(name);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((item) => item.name);
}

/**
 * Suggestions for what has been typed so far, best match first.
 *
 * Three tiers, because "ALEX" should reach "ALEXANDR KISSELEV" and "KISSELEV ALEXANDR" alike:
 * names starting with the query, then names with a *word* starting with it, then anything merely
 * containing it. An empty query returns nothing — suggestions appear once typing starts, rather
 * than dumping the whole crew list into the form.
 */
export function filterCrewNames(names: string[], query: string, limit = 5): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const startsWith: string[] = [];
  const wordStartsWith: string[] = [];
  const contains: string[] = [];

  for (const name of names) {
    const haystack = name.toLowerCase();
    // Already typed in full: repeating it back is noise, not help.
    if (haystack === needle) continue;

    if (haystack.startsWith(needle)) startsWith.push(name);
    else if (haystack.split(/\s+/).some((word) => word.startsWith(needle))) wordStartsWith.push(name);
    else if (haystack.includes(needle)) contains.push(name);
  }

  return [...startsWith, ...wordStartsWith, ...contains].slice(0, limit);
}
