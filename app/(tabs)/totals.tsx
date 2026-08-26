import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenTitle } from '@/src/components/ScreenTitle';
import { useDataRefresh } from '@/src/db/dataVersion';
import { listEntries } from '@/src/db/queries/entries';
import {
  DEFAULT_NIGHT_WINDOW,
  NightWindow,
  describeNightWindow,
} from '@/src/lib/daynight/nightWindow';
import { readNightWindow } from '@/src/lib/settings';
import {
  BAND_LOWER_HOURS,
  BAND_UPPER_HOURS,
  BandTotals,
  MonthTotals,
  bandTotals,
  monthlyTotals,
} from '@/src/lib/monthlyTotals';
import { LogbookSummary, ZERO_SUMMARY, summarise } from '@/src/lib/summary';
import { minutesToDecimalHours, minutesToHHMM } from '@/src/lib/time';
import { AppColors, useAppTheme } from '@/src/theme';

export default function TotalsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [totals, setTotals] = useState<LogbookSummary>(ZERO_SUMMARY);
  const [months, setMonths] = useState<MonthTotals[]>([]);
  const [bands, setBands] = useState<BandTotals>(EMPTY_BANDS);
  const [window, setWindow] = useState<NightWindow>(DEFAULT_NIGHT_WINDOW);

  useDataRefresh(
    useCallback(() => {
      // The night window is read alongside the entries rather than cached, so changing it in
      // Settings re-reports the whole logbook the next time this screen is looked at.
      Promise.all([listEntries(), readNightWindow()]).then(([entries, nightWindow]) => {
        const byMonth = monthlyTotals(entries, nightWindow);
        setWindow(nightWindow);
        setTotals(summarise(entries, nightWindow));
        setMonths(byMonth);
        setBands(bandTotals(byMonth));
      });
    }, []),
  );

  return (
    <View style={styles.screen}>
      <ScreenTitle title="Totals" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Group title="Flying">
          <Stat label="Block hours" minutes={totals.blockMinutes} emphasis />
          <Stat label="Deadhead" minutes={totals.deadheadMinutes} />
          <Stat label="Airborne, all sectors" minutes={totals.airborneMinutes} />
        </Group>

        <Group
          title="Night"
          note={`Two counts, because they answer different questions. The first is how much was actually flown in darkness — sun below civil twilight, from its real position along each route. The second is the clock rule your agreement pays on, currently ${describeNightWindow(
            window,
          )}, which you can change in Settings.`}
        >
          <Stat label="Night, actual darkness" minutes={totals.nightMinutes} emphasis />
          <Stat label="Day" minutes={totals.dayMinutes} />
          <Stat label="Night, by clock rule" minutes={totals.windowNightMinutes} emphasis />
          <Stat label="Night incl. deadhead" minutes={totals.nightMinutesInclDeadhead} />
        </Group>

        <Group
          title="Duty"
          note="Report to release, counted once per duty — a multi-sector day is one duty, not three."
        >
          <Stat label="Duty hours" minutes={totals.dutyMinutes} emphasis />
          <Stat label="Ground duty" minutes={totals.groundDutyMinutes} />
          <CountStat label="Duties" value={totals.dutyCount} />
        </Group>

        <Group
          title="Productivity bands"
          note={`Block hours split across the ${BAND_LOWER_HOURS}h and ${BAND_UPPER_HOURS}h thresholds, banded per month and then added up — never from the career total, which would put every month above the line.`}
        >
          <Stat label={`Hours ${BAND_LOWER_HOURS}–${BAND_UPPER_HOURS}`} minutes={bands.midMinutes} emphasis />
          <Stat label={`Hours over ${BAND_UPPER_HOURS}`} minutes={bands.highMinutes} emphasis />
          <CountStat label={`Months reaching ${BAND_LOWER_HOURS}h`} value={bands.monthsInMid + bands.monthsInHigh} />
          <CountStat label={`Months over ${BAND_UPPER_HOURS}h`} value={bands.monthsInHigh} />
        </Group>

        <Group
          title="Sick leave"
          note="Days the roster recorded as absence. SICK is certified sick leave; UFF is temporary unfitness to fly, which the report records without a sicknote."
        >
          <CountStat label="Sick days" value={bands.sickDays} />
          <CountStat label="Months with sick leave" value={bands.monthsWithSickLeave} />
          <CountStat label="Unfit-to-fly days" value={bands.unfitDays} />
        </Group>

        <Group title="Counts">
          <CountStat label="Sectors operated" value={totals.sectorCount} />
          <CountStat label="Sectors with night time" value={totals.nightSectorCount} />
          <CountStat label="Deadhead sectors" value={totals.deadheadCount} />
          <CountStat label="Ground duties" value={totals.groundDutyCount} />
        </Group>

        <Group title="By month">
          {months.length === 0 ? (
            <Text style={styles.groupNote}>Nothing logged yet.</Text>
          ) : (
            <>
              <MonthHeaderRow />
              {months.map((month) => (
                <MonthRow key={month.key} month={month} />
              ))}
            </>
          )}
        </Group>
      </ScrollView>
    </View>
  );
}

const EMPTY_BANDS: BandTotals = {
  midMinutes: 0,
  highMinutes: 0,
  monthsInMid: 0,
  monthsInHigh: 0,
  sickDays: 0,
  unfitDays: 0,
  monthsWithSickLeave: 0,
};

/**
 * One month's line: sectors worked, block hours, how those hours fall across the two thresholds,
 * and whether any of the month was lost to sickness. Blank rather than "00:00" where a band was
 * never reached, so the months that did reach it stand out.
 */
function MonthRow({ month }: { month: MonthTotals }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.monthRow}>
      <Text style={[styles.monthCell, styles.monthLabelCell]} numberOfLines={1}>
        {month.label}
      </Text>
      <Text style={[styles.monthCell, styles.monthNumberCell]}>{month.sectorCount}</Text>
      <Text style={[styles.monthCell, styles.monthNumberCell, styles.monthTotalCell]}>
        {minutesToHHMM(month.blockMinutes)}
      </Text>
      <Text
        style={[
          styles.monthCell,
          styles.monthNumberCell,
          month.bands.midMinutes > 0 && styles.monthBandActive,
        ]}
      >
        {month.bands.midMinutes > 0 ? minutesToHHMM(month.bands.midMinutes) : '–'}
      </Text>
      <Text
        style={[
          styles.monthCell,
          styles.monthNumberCell,
          month.bands.highMinutes > 0 && styles.monthBandActive,
        ]}
      >
        {month.bands.highMinutes > 0 ? minutesToHHMM(month.bands.highMinutes) : '–'}
      </Text>
      <Text style={[styles.monthCell, styles.monthSickCell, month.sickDays > 0 && styles.monthSickActive]}>
        {formatSick(month)}
      </Text>
    </View>
  );
}

function formatSick(month: MonthTotals): string {
  if (month.sickDays === 0 && month.unfitDays === 0) return '–';
  if (month.unfitDays === 0) return String(month.sickDays);
  if (month.sickDays === 0) return `+${month.unfitDays}u`;
  return `${month.sickDays}+${month.unfitDays}u`;
}

function MonthHeaderRow() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.monthRow, styles.monthHeaderRow]}>
      <Text style={[styles.monthHeaderCell, styles.monthLabelCell]}>Month</Text>
      <Text style={[styles.monthHeaderCell, styles.monthNumberCell]}>Sect</Text>
      <Text style={[styles.monthHeaderCell, styles.monthNumberCell]}>Block</Text>
      <Text style={[styles.monthHeaderCell, styles.monthNumberCell]}>
        {BAND_LOWER_HOURS}–{BAND_UPPER_HOURS}
      </Text>
      <Text style={[styles.monthHeaderCell, styles.monthNumberCell]}>{BAND_UPPER_HOURS}+</Text>
      <Text style={[styles.monthHeaderCell, styles.monthSickCell]}>Sick</Text>
    </View>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
      {note && <Text style={styles.groupNote}>{note}</Text>}
    </View>
  );
}

function Stat({ label, minutes, emphasis }: { label: string; minutes: number; emphasis?: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={[styles.label, emphasis && styles.labelEmphasis]}>{label}</Text>
      <View style={styles.valueGroup}>
        <Text style={[styles.value, emphasis && styles.valueEmphasis]}>{minutesToHHMM(minutes)}</Text>
        <Text style={styles.subvalue}>{minutesToDecimalHours(minutes)}h</Text>
      </View>
    </View>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    group: { marginBottom: 28 },
    groupTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    groupNote: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginTop: 10 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    label: { fontSize: 15, color: c.text, flex: 1, paddingRight: 12 },
    labelEmphasis: { fontWeight: '600' },
    valueGroup: { alignItems: 'flex-end' },
    value: { fontSize: 16, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
    valueEmphasis: { fontSize: 19, fontWeight: '700' },
    subvalue: { fontSize: 12, color: c.textMuted },

    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    monthHeaderRow: { borderBottomColor: c.accent, borderBottomWidth: 1, paddingVertical: 6 },
    monthHeaderCell: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    monthCell: { fontSize: 13, color: c.text, fontVariant: ['tabular-nums'] },
    // The label takes the slack so the numeric columns stay aligned down the table.
    monthLabelCell: { flex: 1, textAlign: 'left', paddingRight: 8 },
    monthNumberCell: { width: 54, textAlign: 'right' },
    monthTotalCell: { fontWeight: '700' },
    monthBandActive: { color: c.text, fontWeight: '600' },
    monthSickCell: { width: 48, textAlign: 'right', color: c.textMuted },
    monthSickActive: { color: c.danger, fontWeight: '700' },
  });
