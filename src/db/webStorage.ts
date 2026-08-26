import { CabinCrewLogEntry } from '@/src/types/logbook';

const ENTRIES_KEY = 'fa-logbook:log-entries';
const PREFERENCES_KEY = 'fa-logbook:preferences';

let memoryEntries: CabinCrewLogEntry[] = [];
let memoryPreferences: Record<string, string> = {};
let useMemoryFallback = false;

/**
 * localStorage holds plain JSON with no schema, so entries written before a numeric field
 * existed come back `undefined` — and `number + undefined` is NaN, which would silently poison
 * every total. Native gets this for free from the column's SQL DEFAULT; web needs it here.
 */
function withDefaults(entry: CabinCrewLogEntry): CabinCrewLogEntry {
  return {
    ...entry,
    kind: entry.kind ?? 'operating',
    blockMinutes: entry.blockMinutes ?? 0,
    deadheadMinutes: entry.deadheadMinutes ?? 0,
    groundDutyMinutes: entry.groundDutyMinutes ?? 0,
    dayMinutes: entry.dayMinutes ?? 0,
    nightMinutes: entry.nightMinutes ?? 0,
  };
}

export function loadEntries(): CabinCrewLogEntry[] {
  if (useMemoryFallback) return memoryEntries;
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? (JSON.parse(raw) as CabinCrewLogEntry[]).map(withDefaults) : [];
  } catch {
    useMemoryFallback = true;
    return memoryEntries;
  }
}

export function saveEntries(entries: CabinCrewLogEntry[]): void {
  if (useMemoryFallback) {
    memoryEntries = entries;
    return;
  }
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    useMemoryFallback = true;
    memoryEntries = entries;
  }
}

export function loadPreferences(): Record<string, string> {
  if (useMemoryFallback) return memoryPreferences;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return memoryPreferences;
  }
}

export function savePreferences(preferences: Record<string, string>): void {
  if (useMemoryFallback) {
    memoryPreferences = preferences;
    return;
  }
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    memoryPreferences = preferences;
  }
}
