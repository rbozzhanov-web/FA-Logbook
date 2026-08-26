import { CabinCrewLogEntry } from '@/src/types/logbook';

const REQUIRED_FIELDS = ['date', 'departureAirport', 'arrivalAirport'] as const;

/** An absence is logged for the day alone — no station is required, only date and duty code. */
export function missingRequiredFields(fields: Partial<CabinCrewLogEntry>): string[] {
  const required = fields.kind === 'absence' ? (['date'] as const) : REQUIRED_FIELDS;
  return required.filter((field) => fields[field] === undefined || fields[field] === '');
}

/**
 * A row with no hours at all is not a logbook entry, whichever column those hours belong in —
 * except an absence, which carries no hours by design and is complete without any.
 */
export function hasNoHours(fields: Partial<CabinCrewLogEntry>): boolean {
  if (fields.kind === 'absence') return false;
  return (
    (fields.blockMinutes ?? 0) === 0 &&
    (fields.deadheadMinutes ?? 0) === 0 &&
    (fields.groundDutyMinutes ?? 0) === 0
  );
}
