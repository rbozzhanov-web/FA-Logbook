import { CabinCrewLogEntry } from '@/src/types/logbook';
import { ParsedCandidate } from './types';

export interface AnnotatedCandidate extends ParsedCandidate {
  isDuplicate: boolean;
}

/**
 * Flags candidates that are already in the logbook.
 *
 * Rosters are downloaded monthly and overlap at the edges — a duty that starts on the 31st shows
 * up in both months' reports — so re-importing must not silently double the hours. Flagged rows
 * are still returned (never dropped): the review screen default-excludes them but lets a
 * deliberate re-import be switched back on.
 */
export function annotateDuplicates(
  candidates: ParsedCandidate[],
  existingEntries: CabinCrewLogEntry[],
): AnnotatedCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    isDuplicate: existingEntries.some((existing) => isLikelyDuplicate(candidate, existing)),
  }));
}

function isLikelyDuplicate(candidate: ParsedCandidate, existing: CabinCrewLogEntry): boolean {
  const fields = candidate.fields;
  if (!fields.date) return false;
  if (fields.date !== existing.date) return false;

  // A ground duty has no route to match on, so it is identified by its code and date instead —
  // and must never collapse into a sector that happens to share the day.
  if (fields.kind === 'ground' || existing.kind === 'ground') {
    return fields.kind === existing.kind && fields.dutyCode === existing.dutyCode;
  }

  if (!fields.departureAirport || !fields.arrivalAirport) return false;
  if (fields.departureAirport !== existing.departureAirport) return false;
  if (fields.arrivalAirport !== existing.arrivalAirport) return false;

  // Same route on the same day, worked once and deadheaded once, is two different things — and
  // it happens, on a positioning sector out and an operating sector back.
  if (fields.kind !== existing.kind) return false;

  if (fields.flightNumber && existing.flightNumber && fields.flightNumber !== existing.flightNumber) {
    return false;
  }

  if (fields.timeOut && existing.timeOut && fields.timeOut !== existing.timeOut) return false;

  return true;
}
