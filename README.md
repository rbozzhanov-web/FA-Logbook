# FA Logbook

A logbook for cabin crew: sectors, night hours, duty hours, and import straight from an Air
Astana **Personal Crew Schedule Report**.

Built on the same foundations as the companion Pilot Logbook — Expo, expo-router, SQLite through
Drizzle, pdf.js in a WebView — but the domain and, above all, the parsing are different. A cabin
crew roster is not a pilot's flight-time report, and reading it as one produces wrong hours.

## What makes this roster hard to read

The pilot report is a list: one flight per line, times in Zulu, a tail number on every row. The
crew schedule is none of those things.

**It is a calendar grid, not a table.** The month runs left to right across the page, one column
per day, and a day's duty runs top to bottom inside its column — one value per cell. Reading it
by line yields fragments of thirty-one unrelated days interleaved. So the parser slices the page
into day columns from the heading row's own positions and walks each column downwards
(`src/lib/pdfImport/crewSchedule/grid.ts`).

**A sector is not confined to one day's column.** A departure at 23:09 lands in tomorrow's,
leaving `→` at the foot of one column and picking up under `↓` at the head of the next. A duty
can cross midnight even when its last sector didn't, and then the arrow stands alone. The reader
carries state across the column boundary (`crewSchedule/duties.ts`).

**Its times are local station time**, stated across the top of every page. A sector's clock
readings are therefore not its length: ALA 23:55 → ICN 09:39 reads as 9h44 and is 5h44. Nothing —
block time, night hours, even which calendar day it landed on — can be computed without both
stations' timezones on that date, DST included. So the bundled airport dataset carries an IANA
zone per airport, and every time goes through `daynight/localTime.ts` before anything is counted.

**A lone time is ambiguous.** The same `HH:MM` cell is either the report time that opens a duty or
the release time that closes one. Where a day holds two duties the roster prints them adjacent —
but after a pure positioning duty it prints no release at all, leaving a single time that belongs
to the *next* duty. The parser decides by what follows it, and reading it wrong would close a duty
hours after it ended.

**Positioning sectors look exactly like flights.** The grid marks them with an asterisk on the
departure station (`*ALA`) and the crew list tags the same person `DHC`. They must not count as
hours flown — the airline's own Block Hours total excludes them.

### How we know it's right

The report states its own **Block Hours**, and that figure is arithmetic over the same times the
grid prints. A correct parse reproduces it to the minute; the sample roster's 91:53 comes back as
91:53. That single number catches a missed sector, a double-counted one, a mis-read midnight
arrow, and a timezone conversion gone wrong. It is checked on every import and shown on the review
screen before anything is saved.

The report's **Night Hours** is deliberately *not* treated as an oracle — see below.

## Night hours, twice

Night is reported two ways because there are two different questions.

- **Actual darkness.** Computed from the real position of the sun along the great-circle track,
  civil twilight (sun 6° below the horizon) as the boundary, sampled minute by minute. This is
  how much of the sector was genuinely flown in the dark.
- **Contractual.** A clock window — 22:00–06:00 by default, on the departure station's clock —
  which is what a rostering department counts and what a payslip is based on. Configurable in
  Settings, because the rule is whatever a particular crew agreement says.

They do not agree, and are not meant to. On the sample roster the actual figure is 34:28 while the
airline states 40:00 — a round number no astronomical calculation produces, and one no clock window
reproduces either. The contractual figure is recomputed from each sector's own times rather than
stored, so changing the window re-reports the whole logbook rather than only future imports.

## What gets logged

Four kinds of entry, counted apart because the airline counts them apart:

| Kind | What it is | Counted as |
| --- | --- | --- |
| Operating | Worked the sector as crew | Block hours, day/night |
| Deadhead | Travelled as a passenger to position | Deadhead hours, kept out of block |
| Ground | Training, a briefing, a course | Ground duty hours only |
| Absence | `SICK` (certified) or `UFF` (unfit to fly) | Days, no hours at all |

Days off, downroute days off and standby are deliberately **not** logged — a logbook that
recorded every day off would just be a copy of the roster. Sickness is the exception, because a
month's hours are not interpretable without it: sixty hours flown in a month with a week of sick
leave is a different month from sixty hours flown in a full one.

Duty hours are carried on every sector of a duty and totalled **once per duty** — a three-sector
day is one duty, not three.

## Month by month

Totals carries a per-month table: sectors worked, block hours, how those hours fall across the
60h and 80h thresholds, and any sick leave.

The band split is **progressive, and computed per month**. A month of 91:53 contributes 60:00 to
the base band, 20:00 to the 60–80 band and 11:53 above 80 — the three always sum back to the
month exactly. Banding a career total instead would put every month above the line, so the split
is done month by month and only then added up. The thresholds live in
`src/lib/monthlyTotals.ts` as `BAND_LOWER_HOURS` / `BAND_UPPER_HOURS`; a different agreement is a
one-line change there.

Only *operating* block hours count toward the bands — deadhead and ground duty are excluded,
matching the airline's own arithmetic.

## Pay

The Pay tab works a month's pay out from the logbook, laid out line for line the way a crew pay
spreadsheet lays it out — quantity, multiplier, amount — because the figure gets checked against
a payslip, and when it disagrees the useful question is *which line*.

The agreement is entirely configurable in Settings (`src/lib/pay/payScheme.ts` holds the
defaults), because none of it is a fact about flying:

- an hourly rate everything else is a multiple of;
- **progressive hour bands** — the first 60 h at ×1, 61–80 at ×2, above 80 at ×2.5. Paid as one
  base line across every hour plus a top-up line per band above the first, mirroring how a
  payslip itself prints "all hours" and then a separate surcharge line;
- **progressive sector bands** — the first 15 unpaid, then 16–19 at ×3, 20–24 at ×4, 25–30 at ×5,
  above 30 at ×6. Positioning never reaches these: it is paid on its own line;
- night at ×0.5, by default counted as **exactly half the block hours** — the figure both a
  spreadsheet estimate and a real payslip turned out to pay on — or switchable to the contractual
  clock figure or the astronomical one;
- positioning at ×0.5, by hours or by sectors;
- **prorated** salary and travel allowance — full amounts cut down to the days actually worked
  (calendar days minus certified sick and unfit-to-fly days), toggleable off for an agreement
  that pays them in full regardless of attendance;
- a **sick pay** line, paid per certified sick day at a daily rate you enter yourself. Kazakhstani
  practice bases that rate on average earnings over the trailing 12 months, which can't be
  reconstructed from the roster alone, so it defaults to 0 rather than a plausible-looking guess;
- **ОСМС and ОПВ are each a flat percentage of the full gross**, not cascaded off one another —
  confirmed against a real payslip, where treating them as cascading under-deducts by several
  thousand tenge. Only **ИПН** is computed on what ОСМС, ОПВ, and a standard legal deduction (a
  plain number, since it tracks the yearly минимальный расчётный показатель update) leave;
- block hours themselves default to the airline's own **published CrewPay Norm block times**
  (`src/lib/pay/crewPayNorm.ts`) rather than the roster's real/operated time — this is what
  explained a real gap found this session, where a month's actual block time (91.88 h) fell 3.55 h
  short of what its payslip evidently paid (95.43 h). The norm table is looked up per sector by
  DEP/ARR pair and only within its own stated effective window (currently version 1.64,
  2025‑10‑01–2026‑03‑31); any sector whose route isn't listed, or whose date falls outside that
  window, falls back to actual time, exactly as the published document itself specifies. A toggle
  in Settings switches the whole Pay tab back to actual-only. This basis **never** affects the
  Totals tab, the logbook, or the 60h/80h monthly banding — those stay on real roster block time,
  which is what a logbook should record.

`src/lib/pay/__tests__/calculatePay.test.ts` reproduces a real Air Astana cabin-crew payslip's own
worked example to the tenge — 95.43 h, 20 sectors, 1.72 h positioning, 3 sick days and 1 unfit day
of 31 → gross 840 071.82, net 678 312.64, all fifteen printed lines matching — which is what pins
every band, multiplier and deduction in place. An earlier version of this module was checked
against an informally kept spreadsheet instead (98.22 h → 824 775.5 gross, 654 707 net, still
covered by its own test); the payslip superseded it as the authoritative source once a real one
was available, correcting the deduction model (flat, not cascading) and adding proration and sick
pay, which the spreadsheet didn't have to account for.

The top hour and sector bands run **open-ended** rather than stopping at the last printed band, so
a bigger month is still costed.

Hours are converted **exactly** from the minutes flown — 91:53 is 91.88 h, not 91.53. A
spreadsheet with the roster's "91,53" typed straight into a decimal cell reads slightly lower.
The CrewPay Norm table bundled in `crewPayNorm.ts` is hand-transcribed from the airline's own
published document and only covers what was available at the time — it is a checked-in static
file with no generator script (the same way `src/lib/daynight/airportDb.ts` is), and needs
updating by hand whenever the airline publishes a new season's table. Check the Pay tab against a
real payslip for your own agreement before relying on it.

Airport codes are stored exactly as the roster prints them (IATA: `ALA`, `NQZ`, `AYT`) and exactly
as they are typed in. They are never rewritten to ICAO: this logbook is read against the airline's
own roster, not filed with a licensing authority. The airport database is used only to *look up* a
code for its coordinates and timezone.

## Development

```bash
npm install
npm start          # Expo dev server
npm test           # 167 tests
npx tsc --noEmit   # typecheck
```

### Testing the parser against a real roster

Real rosters carry names, staff numbers and hotel addresses, so none is committed. The suite runs
against a synthetic fixture built to the real document's measured geometry
(`src/lib/pdfImport/__fixtures__/crewScheduleSample.ts`).

To check the parser end to end against an actual report, extract it locally:

```bash
npm run fixture:roster -- ~/Downloads/schedule.pdf
```

That writes `/tmp/fa-realcheck/pages.json` using the very pdf.js build the app ships, so the
fixture is what the parser will be handed on a device. `src/lib/pdfImport/__tests__/realRoster.test.ts`
picks it up automatically and skips when it is absent.

### Layout

```
src/lib/pdfImport/crewSchedule/   reading the roster: grid → duties → sectors, crew lists, memos
src/lib/daynight/                 timezones, sun position, both night calculations
src/lib/summary.ts                every total the app reports, from the entries themselves
src/lib/monthlyTotals.ts          the per-month breakdown and the 60h/80h band split
src/lib/pay/                      the pay agreement and the payslip calculation
src/db/                           SQLite via Drizzle, with a localStorage twin for web
app/                              expo-router screens
```
