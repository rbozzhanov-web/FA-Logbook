/**
 * The airline's own published "CrewPay Norm block times" — a standard block time per route that
 * payroll pays hours on instead of the roster's real operated time, for any route the table
 * covers. The document's own rule for anything else: "If a sector is operated that does not
 * appear on this list, the block time will be taken as actual operated."
 *
 * Hand-transcribed from the airline's published document (version 1.64) — there is no PDF or
 * spreadsheet source in this repo to regenerate it from, so this is a checked-in static table,
 * the same way `daynight/airportDb.ts` is. It only covers what was transcribed: update it by
 * editing the array directly when the airline publishes a new season's table.
 */

export const CREW_PAY_NORM_VERSION = '1.64';
/** Inclusive "YYYY-MM-DD" bounds — the table is only valid for flights in this window. */
export const CREW_PAY_NORM_EFFECTIVE_FROM = '2025-10-01';
export const CREW_PAY_NORM_EFFECTIVE_TO = '2026-03-31';

// [dep, arr, normMinutes] — DEP/ARR exactly as the published table prints them.
const CREW_PAY_NORM_TIMES: readonly [string, string, number][] = [
  ['AKX', 'ALA', 158], // 2:38
  ['AKX', 'NQZ', 109], // 1:49
  ['ALA', 'AKX', 168], // 2:48
  ['ALA', 'AUH', 315], // 5:15
  ['ALA', 'AYT', 367], // 6:07
  ['ALA', 'BKK', 408], // 6:48
  ['ALA', 'BJV', 375], // 6:15
  ['ALA', 'BOM', 289], // 4:49
  ['ALA', 'BSZ', 51], // 0:51
  ['ALA', 'BUS', 276], // 4:36
  ['ALA', 'CAN', 372], // 6:12
  ['ALA', 'CMB', 383], // 6:23
  ['ALA', 'CIT', 92], // 1:32
  ['ALA', 'CTU', 268], // 4:28
  ['ALA', 'CXR', 456], // 7:36
  ['ALA', 'DAD', 410], // 6:50
  ['ALA', 'DEL', 215], // 3:35
  ['ALA', 'DME', 293], // 4:53
  ['ALA', 'DOH', 316], // 5:16
  ['ALA', 'DXB', 302], // 5:02
  ['ALA', 'DYU', 117], // 1:57
  ['ALA', 'FRA', 503], // 8:23
  ['ALA', 'GOI', 301], // 5:01
  ['ALA', 'GUW', 203], // 3:23
  ['ALA', 'GYD', 225], // 3:45
  ['ALA', 'HER', 393], // 6:33
  ['ALA', 'HKT', 429], // 7:09
  ['ALA', 'HRG', 436], // 7:16
  ['ALA', 'ICN', 347], // 5:47
  ['ALA', 'IST', 378], // 6:18
  ['ALA', 'JED', 422], // 7:02
  ['ALA', 'KBP', 331], // 5:31
  ['ALA', 'KGF', 87], // 1:27
  ['ALA', 'KZO', 110], // 1:50
  ['ALA', 'LHR', 578], // 9:38
  ['ALA', 'LED', 333], // 5:33
  ['ALA', 'MED', 402], // 6:42
  ['ALA', 'MLE', 409], // 6:49
  ['ALA', 'NQZ', 115], // 1:55
  ['ALA', 'OVB', 151], // 2:31
  ['ALA', 'OSS', 81], // 1:21
  ['ALA', 'PEK', 290], // 4:50
  ['ALA', 'PLX', 92], // 1:32
  ['ALA', 'PQC', 442], // 7:22
  ['ALA', 'PWQ', 107], // 1:47
  ['ALA', 'SCO', 211], // 3:31
  ['ALA', 'SSH', 430], // 7:10
  ['ALA', 'SYX', 395], // 6:35
  ['ALA', 'TAS', 100], // 1:40
  ['ALA', 'TBS', 253], // 4:13
  ['ALA', 'TGD', 417], // 6:57
  ['ALA', 'TLV', 397], // 6:37
  ['ALA', 'UKK', 97], // 1:37
  ['ALA', 'UBN', 205], // 3:25
  ['ALA', 'URA', 204], // 3:24
  ['ALA', 'URC', 108], // 1:48
  ['AMS', 'GUW', 355], // 5:55
  ['AUH', 'ALA', 256], // 4:16
  ['AUH', 'NQZ', 292], // 4:52
  ['AYT', 'ALA', 320], // 5:20
  ['AYT', 'NQZ', 296], // 4:56
  ['BJV', 'ALA', 326], // 5:26
  ['BJV', 'NQZ', 305], // 5:05
  ['BKK', 'ALA', 435], // 7:15
  ['BOM', 'ALA', 278], // 4:38
  ['BSZ', 'ALA', 60], // 1:00
  ['BUS', 'ALA', 237], // 3:57
  ['BUS', 'NQZ', 222], // 3:42
  ['CAN', 'ALA', 400], // 6:40
  ['CMB', 'ALA', 386], // 6:26
  ['CIT', 'ALA', 75], // 1:15
  ['CIT', 'DOH', 248], // 4:08
  ['CIT', 'JED', 381], // 6:21
  ['CIT', 'MED', 336], // 5:36
  ['CTU', 'ALA', 308], // 5:08
  ['CXR', 'ALA', 478], // 7:58
  ['DAD', 'ALA', 447], // 7:27
  ['DAD', 'NQZ', 518], // 8:38
  ['DEL', 'ALA', 211], // 3:31
  ['DME', 'ALA', 272], // 4:32
  ['DMB', 'NQZ', 109], // 1:49 — verify this DEP code against the source table; may be "DME"
  ['DME', 'NQZ', 210], // 3:30
  ['DOH', 'ALA', 281], // 4:41
  ['DOH', 'CIT', 221], // 3:41
  ['DOH', 'NQZ', 297], // 4:57
  ['DXB', 'ALA', 261], // 4:21
  ['DXB', 'GUW', 239], // 3:59
  ['DXB', 'NQZ', 284], // 4:44
  ['DYU', 'ALA', 111], // 1:51
  ['FRA', 'ALA', 438], // 7:18
  ['FRA', 'GUW', 353], // 5:53
  ['FRA', 'NQZ', 434], // 7:14
  ['FRA', 'URA', 363], // 6:03
  ['FRU', 'NQZ', 99], // 1:39
  ['GOI', 'ALA', 312], // 5:12
  ['GUW', 'ALA', 171], // 2:51
  ['GUW', 'AMS', 391], // 6:31
  ['GUW', 'DXB', 239], // 3:59
  ['GUW', 'FRA', 384], // 6:24
  ['GUW', 'GYD', 87], // 1:27
  ['GUW', 'IST', 239], // 3:59
  ['GUW', 'NQZ', 136], // 2:16
  ['GUW', 'SCO', 55], // 0:55
  ['GUW', 'TBS', 109], // 1:49
  ['GUW', 'URA', 60], // 1:00
  ['GYD', 'ALA', 185], // 3:05
  ['GYD', 'GUW', 90], // 1:30
  ['HER', 'ALA', 349], // 5:49
  ['HKT', 'ALA', 452], // 7:32
  ['HKT', 'NQZ', 448], // 7:28
  ['HRG', 'ALA', 392], // 6:32
  ['HRG', 'NQZ', 371], // 6:11
  ['ICN', 'ALA', 422], // 7:02
  ['ICN', 'NQZ', 457], // 7:37
  ['IST', 'ALA', 310], // 5:10
  ['IST', 'GUW', 212], // 3:32
  ['IST', 'NQZ', 293], // 4:53
  ['JED', 'CIT', 363], // 6:03
  ['JED', 'ALA', 361], // 6:01
  ['KBP', 'ALA', 302], // 5:02
  ['KBP', 'NQZ', 248], // 4:08
  ['KGF', 'ALA', 92], // 1:32
  ['KGF', 'NQZ', 52], // 0:52
  ['KSN', 'NQZ', 74], // 1:14
  ['KZO', 'ALA', 102], // 1:42
  ['KZO', 'NQZ', 95], // 1:35
  ['LED', 'ALA', 279], // 4:39
  ['LED', 'NQZ', 242], // 4:02
  ['LHR', 'ALA', 494], // 8:14
  ['LHR', 'NQZ', 470], // 7:50
  ['LHR', 'SCO', 354], // 5:54
  ['MED', 'ALA', 339], // 5:39
  ['MED', 'CIT', 284], // 4:44
  ['MLE', 'ALA', 405], // 6:45
  ['MLE', 'NQZ', 457], // 7:37
  ['OSS', 'ALA', 77], // 1:17
  ['PEK', 'ALA', 336], // 5:36
  ['PEK', 'NQZ', 371], // 6:11
  ['PQC', 'ALA', 472], // 7:52
  ['PQC', 'NQZ', 539], // 8:59
  ['SCO', 'ALA', 189], // 3:09
  ['SCO', 'GUW', 58], // 0:58
  ['SCO', 'LHR', 411], // 6:51
  ['SCO', 'MED', 231], // 3:51
  ['SCO', 'NQZ', 161], // 2:41
  ['SSH', 'NQZ', 385], // 6:25
  ['SSH', 'ALA', 381], // 6:21
  ['SYX', 'ALA', 436], // 7:16
  ['SYX', 'NQZ', 455], // 7:35
  ['TAS', 'ALA', 91], // 1:31
  ['TAS', 'NQZ', 122], // 2:02
  ['TBS', 'ALA', 225], // 3:45
  ['TBS', 'GUW', 110], // 1:50
  ['TBS', 'NQZ', 201], // 3:21
  ['TGD', 'ALA', 358], // 5:58
  ['TGD', 'NQZ', 341], // 5:41
];

const normIndex = new Map<string, number>();
for (const [dep, arr, minutes] of CREW_PAY_NORM_TIMES) {
  normIndex.set(`${dep}|${arr}`, minutes);
}

/** The published norm block time for a sector, in minutes, or undefined if the route isn't listed. */
export function findCrewPayNormMinutes(dep: string, arr: string): number | undefined {
  return normIndex.get(`${dep.toUpperCase()}|${arr.toUpperCase()}`);
}

/** Whether `date` ("YYYY-MM-DD") falls inside this table's own stated effective window. */
export function crewPayNormCoversDate(date: string): boolean {
  return date >= CREW_PAY_NORM_EFFECTIVE_FROM && date <= CREW_PAY_NORM_EFFECTIVE_TO;
}
