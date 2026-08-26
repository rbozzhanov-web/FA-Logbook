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
import { LogbookSummary, ZERO_SUMMARY, summarise } from '@/src/lib/summary';
import { minutesToDecimalHours, minutesToHHMM } from '@/src/lib/time';
import { AppColors, useAppTheme } from '@/src/theme';

export default function TotalsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [totals, setTotals] = useState<LogbookSummary>(ZERO_SUMMARY);
  const [window, setWindow] = useState<NightWindow>(DEFAULT_NIGHT_WINDOW);

  useDataRefresh(
    useCallback(() => {
      // The night window is read alongside the entries rather than cached, so changing it in
      // Settings re-reports the whole logbook the next time this screen is looked at.
      Promise.all([listEntries(), readNightWindow()]).then(([entries, nightWindow]) => {
        setWindow(nightWindow);
        setTotals(summarise(entries, nightWindow));
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

        <Group title="Counts">
          <CountStat label="Sectors operated" value={totals.sectorCount} />
          <CountStat label="Sectors with night time" value={totals.nightSectorCount} />
          <CountStat label="Deadhead sectors" value={totals.deadheadCount} />
          <CountStat label="Ground duties" value={totals.groundDutyCount} />
        </Group>
      </ScrollView>
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
  });
