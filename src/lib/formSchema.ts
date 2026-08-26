import { z } from 'zod';

import { hhmmToMinutes, minutesToHHMM } from '@/src/lib/time';
import { CabinCrewLogEntry, NEW_ENTRY_DEFAULTS, SectorKind } from '@/src/types/logbook';
import { NewLogEntry } from '@/src/db/queries/entries';

const optionalTime = z
  .string()
  .trim()
  .refine((value) => value === '' || hhmmToMinutes(value) !== null, 'Use HH:MM');

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use YYYY-MM-DD');

export const entryFormSchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    kind: z.enum(['operating', 'deadhead', 'ground', 'absence']),
    flightNumber: z.string().trim(),
    // 3 or 4 letters covers IATA and ICAO alike. Whichever is entered is what gets stored —
    // the code is never rewritten from one to the other.
    departureAirport: z
      .string()
      .trim()
      .min(3, 'Required')
      .max(4)
      .regex(/^[A-Za-z]{3,4}$/, '3-4 letters'),
    arrivalAirport: z
      .string()
      .trim()
      .min(3, 'Required')
      .max(4)
      .regex(/^[A-Za-z]{3,4}$/, '3-4 letters'),
    aircraftType: z.string().trim(),
    timeOut: optionalTime,
    timeIn: optionalTime,
    arrivalDate: optionalDate,
    blockTime: optionalTime,
    deadheadTime: optionalTime,
    groundDutyTime: optionalTime,
    dayTime: optionalTime,
    nightTime: optionalTime,
    position: z.string().trim(),
    dutyCode: z.string().trim(),
    dutyStartDate: optionalDate,
    dutyStartTime: optionalTime,
    dutyEndDate: optionalDate,
    dutyEndTime: optionalTime,
    captainName: z.string().trim(),
    purserName: z.string().trim(),
    otherCrewNames: z.string().trim(),
    remarks: z.string().trim(),
  })
  .refine(
    (values) => {
      // An absence is the one entry with nothing to total: it is logged for the day it covers,
      // which is exactly what makes a month's hours readable.
      if (values.kind === 'absence') return values.dutyCode !== '';
      if (values.kind === 'ground') return values.groundDutyTime !== '';
      return values.blockTime !== '' || values.deadheadTime !== '';
    },
    {
      message: 'Enter the time for this sector — block time if you worked it, deadhead time if you travelled on it',
      path: ['blockTime'],
    },
  )
  // Day and night are the split of the sector's own time, so they have to add up to it. A
  // logbook whose columns don't sum to the total is wrong on its face, and a hand-edited entry
  // is exactly where that slips in.
  .refine(
    (values) => {
      if (values.kind === 'ground' || values.kind === 'absence') return true;
      const airborne = minutes(values.blockTime) + minutes(values.deadheadTime);
      const split = minutes(values.dayTime) + minutes(values.nightTime);
      return split === 0 || split === airborne;
    },
    {
      message: 'Day and night must add up to the sector time. Recompute them, or clear both.',
      path: ['nightTime'],
    },
  );

export type EntryFormValues = z.infer<typeof entryFormSchema>;

export const EMPTY_FORM_VALUES: EntryFormValues = {
  date: '',
  kind: 'operating',
  flightNumber: '',
  departureAirport: '',
  arrivalAirport: '',
  aircraftType: '',
  timeOut: '',
  timeIn: '',
  arrivalDate: '',
  blockTime: '',
  deadheadTime: '',
  groundDutyTime: '',
  dayTime: '',
  nightTime: '',
  position: '',
  dutyCode: '',
  dutyStartDate: '',
  dutyStartTime: '',
  dutyEndDate: '',
  dutyEndTime: '',
  captainName: '',
  purserName: '',
  otherCrewNames: '',
  remarks: '',
};

function minutes(value: string): number {
  return hhmmToMinutes(value) ?? 0;
}

/** Joins a date and a time into the "YYYY-MM-DDTHH:MM" a duty boundary is stored as. */
function joinDateTime(date: string, time: string): string | undefined {
  return date && time ? `${date}T${time}` : undefined;
}

function splitDateTime(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date, time] = value.split('T');
  return { date: date ?? '', time: time ?? '' };
}

export function formValuesToEntry(values: EntryFormValues): NewLogEntry {
  const kind = values.kind as SectorKind;

  return {
    ...NEW_ENTRY_DEFAULTS,
    date: values.date,
    kind,
    flightNumber: values.flightNumber || undefined,
    // Stored exactly as typed, only upper-cased. No IATA-to-ICAO rewriting: the logbook is read
    // against the roster it came from, which uses the code the crew member typed.
    departureAirport: values.departureAirport.toUpperCase(),
    arrivalAirport: values.arrivalAirport.toUpperCase(),
    aircraftType: values.aircraftType || undefined,
    timeOut: values.timeOut || undefined,
    timeIn: values.timeIn || undefined,
    arrivalDate: values.arrivalDate || undefined,
    blockMinutes: kind === 'operating' ? minutes(values.blockTime) : 0,
    deadheadMinutes: kind === 'deadhead' ? minutes(values.deadheadTime) : 0,
    groundDutyMinutes: kind === 'ground' ? minutes(values.groundDutyTime) : 0,
    // An absence carries no hours of any kind, so neither the split nor the times survive it.
    dayMinutes: kind === 'ground' || kind === 'absence' ? 0 : minutes(values.dayTime),
    nightMinutes: kind === 'ground' || kind === 'absence' ? 0 : minutes(values.nightTime),
    position: values.position.toUpperCase() || undefined,
    dutyCode: values.dutyCode.toUpperCase() || undefined,
    dutyStart: joinDateTime(values.dutyStartDate, values.dutyStartTime),
    dutyEnd: joinDateTime(values.dutyEndDate, values.dutyEndTime),
    captainName: values.captainName || undefined,
    purserName: values.purserName || undefined,
    otherCrewNames: values.otherCrewNames || undefined,
    remarks: values.remarks || undefined,
    source: 'manual',
  };
}

/**
 * Like entryToFormValues, but tolerant of a partial entry — used for PDF-import candidates,
 * which may be missing fields the parser couldn't populate.
 */
export function partialEntryToFormValues(entry: Partial<CabinCrewLogEntry>): EntryFormValues {
  const dutyStart = splitDateTime(entry.dutyStart);
  const dutyEnd = splitDateTime(entry.dutyEnd);

  return {
    ...EMPTY_FORM_VALUES,
    date: entry.date ?? '',
    kind: entry.kind ?? 'operating',
    flightNumber: entry.flightNumber ?? '',
    departureAirport: entry.departureAirport ?? '',
    arrivalAirport: entry.arrivalAirport ?? '',
    aircraftType: entry.aircraftType ?? '',
    timeOut: entry.timeOut ?? '',
    timeIn: entry.timeIn ?? '',
    arrivalDate: entry.arrivalDate ?? '',
    blockTime: entry.blockMinutes ? minutesToHHMM(entry.blockMinutes) : '',
    deadheadTime: entry.deadheadMinutes ? minutesToHHMM(entry.deadheadMinutes) : '',
    groundDutyTime: entry.groundDutyMinutes ? minutesToHHMM(entry.groundDutyMinutes) : '',
    dayTime: entry.dayMinutes !== undefined ? minutesToHHMM(entry.dayMinutes) : '',
    nightTime: entry.nightMinutes !== undefined ? minutesToHHMM(entry.nightMinutes) : '',
    position: entry.position ?? '',
    dutyCode: entry.dutyCode ?? '',
    dutyStartDate: dutyStart.date,
    dutyStartTime: dutyStart.time,
    dutyEndDate: dutyEnd.date,
    dutyEndTime: dutyEnd.time,
    captainName: entry.captainName ?? '',
    purserName: entry.purserName ?? '',
    otherCrewNames: entry.otherCrewNames ?? '',
    remarks: entry.remarks ?? '',
  };
}

export function entryToFormValues(entry: CabinCrewLogEntry): EntryFormValues {
  return partialEntryToFormValues(entry);
}
