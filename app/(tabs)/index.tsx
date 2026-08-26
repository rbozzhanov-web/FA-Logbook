import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import { DatePicker } from '@/src/components/DatePicker';
import { GlassSurface } from '@/src/components/GlassSurface';
import { ScreenTitle } from '@/src/components/ScreenTitle';
import { useDataRefresh } from '@/src/db/dataVersion';
import { listEntries } from '@/src/db/queries/entries';
import { MonthRow, MonthSection, YearHeader, groupEntriesByMonth, isYearDivider } from '@/src/lib/groupEntries';
import { EntryLocation, YearFilter, filterByYear, findNearestEntry, listYears } from '@/src/lib/logbookNavigation';
import { minutesToHHMM } from '@/src/lib/time';
import { AppColors, useAppTheme } from '@/src/theme';
import { CabinCrewLogEntry, sectorMinutes } from '@/src/types/logbook';

export default function LogbookScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<CabinCrewLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Kept in screen state, not re-derived on focus: the tab stays mounted, so a chosen year
  // survives a trip to Totals and back.
  const [year, setYear] = useState<YearFilter>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingJump, setPendingJump] = useState<string>();

  const listRef = useRef<SectionList<MonthRow, MonthSection>>(null);
  const jumpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const years = useMemo(() => listYears(entries), [entries]);
  const sections = useMemo(
    () => groupEntriesByMonth(filterByYear(entries, year)),
    [entries, year],
  );

  const reload = useCallback(() => {
    setLoading(true);
    listEntries()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  useDataRefresh(reload);

  const scrollOnce = useCallback((location: EntryLocation, animated: boolean) => {
    listRef.current?.scrollToLocation({
      sectionIndex: location.sectionIndex,
      // SectionList counts the section header as itemIndex 0, so a row at data[i] is i + 1.
      itemIndex: location.rowIndex + 1,
      viewPosition: 0,
      animated,
    });
  }, []);

  /**
   * Scrolls to a row, then corrects itself twice.
   *
   * A jump into a stretch of the logbook the list has not rendered yet is computed from *estimated*
   * row heights, so it lands near the target rather than on it — a jump across several years can
   * end up months out. Once those rows exist and have been measured, repeating the scroll resolves
   * to the real offset. The corrections are unanimated so they read as the scroll settling rather
   * than as three separate movements.
   */
  const jumpTo = useCallback(
    (location: EntryLocation) => {
      jumpTimers.current.forEach(clearTimeout);
      scrollOnce(location, true);
      jumpTimers.current = [400, 900].map((delay) =>
        setTimeout(() => scrollOnce(location, false), delay),
      );
    },
    [scrollOnce],
  );

  useEffect(() => () => jumpTimers.current.forEach(clearTimeout), []);

  /**
   * Runs after the sections have been rebuilt, which matters when the jump also cleared the year
   * filter: the target row does not exist in the list until that re-render has happened.
   */
  useEffect(() => {
    if (!pendingJump) return;
    const location = findNearestEntry(sections, pendingJump);
    setPendingJump(undefined);
    if (location) jumpTo(location);
  }, [jumpTo, pendingJump, sections]);

  const jumpToDate = (date: string) => {
    setPickerOpen(false);
    // Narrow to the target year first. Not only a convenience: scrolling a multi-year list into a
    // stretch it has not rendered yet is computed from estimated row heights and can land months
    // out, while one year is short enough to reach exactly. The chip then shows where you landed.
    // A year with no entries falls back to the whole logbook so the nearest one is still found.
    const targetYear = date.slice(0, 4);
    setYear(years.includes(targetYear) ? targetYear : undefined);
    setPendingJump(date);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={styles.container}>
      <ScreenTitle title="Logbook" />

      <View style={styles.headerRow}>
        <Link href="/import/pick" asChild>
          <Pressable style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Import roster</Text>
          </Pressable>
        </Link>
        <Pressable style={[styles.headerButton, styles.primaryButton]} onPress={() => router.push('/entry/new')}>
          <Text style={styles.primaryButtonText}>+ New entry</Text>
        </Pressable>
      </View>

      {years.length > 0 && (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <YearChip label="All" active={year === undefined} onPress={() => setYear(undefined)} />
            {years.map((value) => (
              <YearChip key={value} label={value} active={year === value} onPress={() => setYear(value)} />
            ))}
          </ScrollView>
          <Pressable
            style={[styles.jumpButton, pickerOpen && styles.jumpButtonActive]}
            onPress={() => setPickerOpen((open) => !open)}
          >
            <Text style={styles.jumpButtonText}>Date</Text>
          </Pressable>
        </View>
      )}

      {pickerOpen && (
        <DatePicker
          initialDate={entries[0]?.date ?? today}
          onPick={jumpToDate}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={reload}
        stickySectionHeadersEnabled
        contentContainerStyle={sections.length === 0 && styles.emptyContainer}
        onScrollToIndexFailed={() => {
          // The list can refuse a row it has not measured at all. The corrective passes jumpTo
          // already schedules cover this, so there is nothing to do beyond not crashing — but the
          // handler must exist, since without one React Native throws instead.
        }}
        ListHeaderComponent={
          sections[0]?.leadingYearHeader ? <YearDivider yearHeader={sections[0].leadingYearHeader} /> : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {year ? `Nothing logged in ${year}.` : 'Nothing logged yet.'}
              </Text>
              <Text style={styles.emptySubtext}>
                {year ? 'Pick another year, or All.' : 'Import your crew schedule, or add an entry by hand.'}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => {
          const month = section as unknown as MonthSection;
          return (
            <GlassSurface
              style={styles.monthHeader}
              fallbackStyle={styles.monthHeaderSolid}
              tintColor={colors.surfaceAlt}
            >
              <Text style={styles.monthLabel}>{month.monthLabel}</Text>
              <Text style={styles.monthTotal}>
                {month.sectorCount} · {minutesToHHMM(month.totalMinutes)}
              </Text>
            </GlassSurface>
          );
        }}
        renderItem={({ item }) => {
          if (isYearDivider(item)) return <YearDivider yearHeader={item.yearHeader} />;
          return <EntryRow entry={item} onPress={() => router.push(`/entry/${item.id}`)} />;
        }}
      />
    </View>
  );
}

function EntryRow({ entry, onPress }: { entry: CabinCrewLogEntry; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isGround = entry.kind === 'ground';
  const isDeadhead = entry.kind === 'deadhead';
  // A ground duty has no route; showing it as "ALA → ALA" would read like a flight that never
  // moved, so it leads with its own code instead.
  const title = isGround
    ? entry.dutyCode ?? 'Ground duty'
    : `${entry.departureAirport} → ${entry.arrivalAirport}`;
  const minutes = isGround ? entry.groundDutyMinutes : sectorMinutes(entry);

  const meta = [
    entry.date,
    isGround ? entry.departureAirport : entry.flightNumber,
    isGround ? undefined : entry.aircraftType,
    entry.position,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.routeRow}>
          <Text style={styles.route}>{title}</Text>
          {isDeadhead && <Badge label="DH" />}
          {isGround && <Badge label="GND" />}
        </View>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.time, (isGround || isDeadhead) && styles.mutedTime]}>
          {minutesToHHMM(minutes)}
        </Text>
        {entry.nightMinutes > 0 && (
          <Text style={styles.nightTime}>night {minutesToHHMM(entry.nightMinutes)}</Text>
        )}
      </View>
    </Pressable>
  );
}

function Badge({ label }: { label: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function YearChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function YearDivider({ yearHeader }: { yearHeader: YearHeader }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { year, sectorCount, totalMinutes } = yearHeader;

  return (
    <View style={styles.yearHeader}>
      <Text style={styles.yearLabel}>{year}</Text>
      <Text style={styles.yearTotal}>
        {sectorCount} {sectorCount === 1 ? 'sector' : 'sectors'} · {minutesToHHMM(totalMinutes)}
      </Text>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerRow: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 8 },
    headerButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    headerButtonText: { color: c.primary, fontWeight: '600' },
    primaryButton: { backgroundColor: c.primary },
    primaryButtonText: { color: c.onPrimary, fontWeight: '700' },

    filterRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, paddingBottom: 8, gap: 8 },
    chips: { paddingHorizontal: 16, gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
    chipTextActive: { color: c.onPrimary },
    jumpButton: {
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    jumpButtonActive: { backgroundColor: c.surfaceAlt },
    jumpButtonText: { color: c.text, fontWeight: '600', fontSize: 13 },

    yearHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: c.accent,
      marginBottom: 4,
    },
    yearLabel: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: 0.5 },
    yearTotal: { fontSize: 13, fontWeight: '600', color: c.textMuted, fontVariant: ['tabular-nums'] },

    monthHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    // Only when Liquid Glass is unavailable; with it, the material is the background.
    monthHeaderSolid: { backgroundColor: c.surfaceAlt },
    monthLabel: { fontSize: 14, fontWeight: '700', color: c.text },
    monthTotal: { fontSize: 13, fontWeight: '600', color: c.textMuted, fontVariant: ['tabular-nums'] },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.card,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowLeft: { flex: 1 },
    rowRight: { alignItems: 'flex-end' },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    route: { fontSize: 16, fontWeight: '600', color: c.text },
    badge: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    badgeText: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
    meta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    time: { fontSize: 16, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
    mutedTime: { color: c.textMuted },
    nightTime: { fontSize: 11, color: c.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
    emptyContainer: { flex: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.text },
    emptySubtext: { fontSize: 13, color: c.textMuted, marginTop: 4 },
  });
