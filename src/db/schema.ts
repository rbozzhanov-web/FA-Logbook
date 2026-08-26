import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const logEntries = sqliteTable(
  'log_entries',
  {
    id: text('id').primaryKey(),
    /** Local date at the departure station, as the roster prints it. */
    date: text('date').notNull(),
    /** 'operating' | 'deadhead' | 'ground'. */
    kind: text('kind').notNull().default('operating'),
    flightNumber: text('flight_number'),
    /** Stored exactly as flown — IATA from the roster, never rewritten to ICAO. */
    departureAirport: text('departure_airport').notNull(),
    arrivalAirport: text('arrival_airport').notNull(),
    aircraftType: text('aircraft_type'),

    /** "HH:MM" local at the departure and arrival stations respectively. */
    timeOut: text('time_out'),
    timeIn: text('time_in'),
    arrivalDate: text('arrival_date'),

    blockMinutes: integer('block_minutes').notNull().default(0),
    deadheadMinutes: integer('deadhead_minutes').notNull().default(0),
    groundDutyMinutes: integer('ground_duty_minutes').notNull().default(0),
    dayMinutes: integer('day_minutes').notNull().default(0),
    nightMinutes: integer('night_minutes').notNull().default(0),

    position: text('position'),
    dutyCode: text('duty_code'),

    dutyStart: text('duty_start'),
    dutyEnd: text('duty_end'),
    dutySectorIndex: integer('duty_sector_index'),
    dutySectorCount: integer('duty_sector_count'),

    captainName: text('captain_name'),
    purserName: text('purser_name'),
    otherCrewNames: text('other_crew_names'),
    remarks: text('remarks'),

    source: text('source').notNull().default('manual'),
    importBatchId: text('import_batch_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_log_entries_date').on(table.date),
    index('idx_log_entries_import_batch').on(table.importBatchId),
  ],
);

/**
 * Small key/value store for settings that change how figures are reported — currently the night
 * window. Kept in the database rather than in device storage so it travels with the logbook it
 * describes: a total labelled "night" means nothing without the rule it was counted under.
 */
export const preferences = sqliteTable('preferences', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
