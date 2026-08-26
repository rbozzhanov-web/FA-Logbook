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

Three kinds of entry, counted apart because the airline counts them apart:

| Kind | What it is | Counted as |
| --- | --- | --- |
| Operating | Worked the sector as crew | Block hours, day/night |
| Deadhead | Travelled as a passenger to position | Deadhead hours, kept out of block |
| Ground | Training, a briefing, a course | Ground duty hours only |

Duty hours are carried on every sector of a duty and totalled **once per duty** — a three-sector
day is one duty, not three.

Airport codes are stored exactly as the roster prints them (IATA: `ALA`, `NQZ`, `AYT`) and exactly
as they are typed in. They are never rewritten to ICAO: this logbook is read against the airline's
own roster, not filed with a licensing authority. The airport database is used only to *look up* a
code for its coordinates and timezone.

## Development

```bash
npm install
npm start          # Expo dev server
npm test           # 112 tests
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
src/db/                           SQLite via Drizzle, with a localStorage twin for web
app/                              expo-router screens
```
