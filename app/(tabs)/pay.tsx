import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenTitle } from '@/src/components/ScreenTitle';
import { useDataRefresh } from '@/src/db/dataVersion';
import { listEntries } from '@/src/db/queries/entries';
import { MonthTotals, monthlyTotals } from '@/src/lib/monthlyTotals';
import { PayCalculation, PayLine, calculateMonthPay } from '@/src/lib/pay/calculatePay';
import { formatHours, formatMoney } from '@/src/lib/pay/format';
import { DEFAULT_PAY_SCHEME, PayScheme } from '@/src/lib/pay/payScheme';
import { readNightWindow, readPayScheme } from '@/src/lib/settings';
import { AppColors, useAppTheme } from '@/src/theme';

/**
 * A month's pay, laid out the way the crew pay spreadsheet lays it out.
 *
 * Deliberately line for line rather than a single headline number: this figure gets checked
 * against a payslip, and when it disagrees the useful question is *which line*. Every row shows
 * the quantity and the multiplier it came from, so the disagreement can be pointed at.
 */
export default function PayScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [months, setMonths] = useState<MonthTotals[]>([]);
  const [scheme, setScheme] = useState<PayScheme>(DEFAULT_PAY_SCHEME);
  const [selectedKey, setSelectedKey] = useState<string>();

  useDataRefresh(
    useCallback(() => {
      Promise.all([listEntries(), readNightWindow(), readPayScheme()]).then(
        ([entries, nightWindow, payScheme]) => {
          setMonths(monthlyTotals(entries, nightWindow));
          setScheme(payScheme);
        },
      );
    }, []),
  );

  // Defaults to the newest month, but only until one is picked — re-deriving it on every reload
  // would snap the screen back off whatever month was being looked at.
  const selected = months.find((month) => month.key === selectedKey) ?? months[0];
  const pay = useMemo(
    () => (selected ? calculateMonthPay(selected, scheme) : undefined),
    [selected, scheme],
  );

  if (!selected || !pay) {
    return (
      <View style={styles.screen}>
        <ScreenTitle title="Pay" />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing to calculate yet.</Text>
          <Text style={styles.emptySubtext}>
            Import a roster, then pick a month here. The rates live in Settings.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenTitle title="Pay" />

      <View style={styles.monthBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {months.map((month) => (
            <Pressable
              key={month.key}
              style={[styles.chip, month.key === selected.key && styles.chipActive]}
              onPress={() => setSelectedKey(month.key)}
            >
              <Text style={[styles.chipText, month.key === selected.key && styles.chipTextActive]}>
                {month.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.netCard}>
          <Text style={styles.netLabel}>Take-home, {selected.label}</Text>
          <Text style={styles.netValue}>{formatMoney(pay.net)} ₸</Text>
          <Text style={styles.netMeta}>
            {formatMoney(pay.gross)} ₸ gross · {formatMoney(pay.totalDeductions)} ₸ deducted
          </Text>
        </View>

        <Section
          title="Hours"
          note={`${formatHours(pay.inputs.blockHours)} h of operating block time, at ${formatMoney(
            scheme.hourlyRate,
          )} ₸ an hour.${
            scheme.blockHoursBasis === 'norm'
              ? ' Counted from the published CrewPay norm where a route is listed, actual time otherwise.'
              : ' Counted from actual time flown.'
          }`}
        >
          <LineRow line={pay.hourBaseLine} unit="h" rate={scheme.hourlyRate} />
          {pay.hourSurchargeLines.map((line) => (
            <LineRow key={line.label} line={line} unit="h" rate={scheme.hourlyRate} />
          ))}
          <SubtotalRow label="Hour pay" amount={pay.hourPay} />
        </Section>

        <Section
          title="Night"
          note={
            scheme.nightBasis === 'halfBlock'
              ? 'Counted as half the block hours, the default an agreement pays on.'
              : scheme.nightBasis === 'contractual'
                ? 'Counted under the clock rule set in Settings — the figure an agreement pays on.'
                : 'Counted from the sun’s real position along each route.'
          }
        >
          <LineRow line={pay.nightLine} unit="h" rate={scheme.hourlyRate} />
        </Section>

        <Section
          title="Sectors"
          note={`${selected.sectorCount} sectors operated. Positioning is paid separately and never reaches these bands.`}
        >
          {pay.sectorLines.map((line) => (
            <LineRow key={line.label} line={line} unit="sectors" rate={scheme.hourlyRate} />
          ))}
          <SubtotalRow label="Sector pay" amount={pay.sectorPay} />
        </Section>

        <Section title="Positioning">
          <LineRow
            line={pay.deadheadLine}
            unit={scheme.deadheadBasis === 'hours' ? 'h' : 'sectors'}
            rate={scheme.hourlyRate}
          />
        </Section>

        <Section
          title="Fixed"
          note={
            pay.paidDays < pay.inputs.daysInMonth
              ? `Prorated to ${pay.paidDays} of ${pay.inputs.daysInMonth} paid days (${pay.inputs.sickDays} sick, ${pay.inputs.unfitDays} unfit to fly).`
              : undefined
          }
        >
          <AmountRow label="Salary" amount={pay.salaryLine.amount} />
          <AmountRow label="Travel allowance" amount={pay.transportLine.amount} />
          {pay.sickLine.amount > 0 && <AmountRow label="Sick pay" amount={pay.sickLine.amount} />}
        </Section>

        <Section title="Gross">
          <AmountRow label="Salary" amount={pay.salaryLine.amount} />
          <AmountRow label="Travel allowance" amount={pay.transportLine.amount} />
          <AmountRow label="Sick pay" amount={pay.sickLine.amount} />
          <AmountRow label="Hour pay" amount={pay.hourPay} />
          <AmountRow label="Night" amount={pay.nightLine.amount} />
          <AmountRow label="Sectors" amount={pay.sectorPay} />
          <AmountRow label="Positioning" amount={pay.deadheadLine.amount} />
          <SubtotalRow label="Total" amount={pay.gross} />
        </Section>

        <Section
          title="Deductions"
          note={`ОСМС and ОПВ are each ${percent(
            scheme.osmsRate,
          )} / ${percent(scheme.opvRate)} of the gross. ИПН is ${percent(
            scheme.ipnRate,
          )} of what they and the standard deduction (${formatMoney(scheme.ipnStandardDeduction)} ₸) leave.`}
        >
          <AmountRow label={`ОСМС ${percent(scheme.osmsRate)}`} amount={-pay.osms} />
          <AmountRow label={`ОПВ ${percent(scheme.opvRate)}`} amount={-pay.opv} />
          <AmountRow label={`ИПН ${percent(scheme.ipnRate)}`} amount={-pay.ipn} />
          <SubtotalRow label="Take-home" amount={pay.net} />
        </Section>

        <Text style={styles.disclaimer}>
          Worked from the logbook under the agreement set in Settings. Hours are converted exactly
          from the minutes flown, so a month of 91:53 counts as 91.88 h — a spreadsheet with
          &quot;91,53&quot; typed into a decimal cell will read slightly lower. Check against your
          payslip before relying on it.
        </Text>
      </ScrollView>
    </View>
  );
}

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/** A tier line: what it counted, at what multiple of the rate, and what that came to. */
function LineRow({ line, unit, rate }: { line: PayLine; unit: 'h' | 'sectors'; rate: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const quantity = unit === 'h' ? `${formatHours(line.units)} h` : `${line.units}`;
  const workings =
    line.multiplier === 0
      ? 'not paid'
      : `${quantity} × ${formatMoney(rate)}${line.multiplier === 1 ? '' : ` × ${line.multiplier}`}`;

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.label}>{line.label}</Text>
        <Text style={styles.workings}>{workings}</Text>
      </View>
      <Text style={[styles.value, line.amount === 0 && styles.valueMuted]}>
        {formatMoney(line.amount)}
      </Text>
    </View>
  );
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, amount < 0 && styles.valueNegative]}>{formatMoney(amount)}</Text>
    </View>
  );
}

function SubtotalRow({ label, amount }: { label: string; amount: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, styles.subtotalRow]}>
      <Text style={[styles.label, styles.subtotalLabel]}>{label}</Text>
      <Text style={[styles.value, styles.subtotalValue]}>{formatMoney(amount)}</Text>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {note && <Text style={styles.sectionNote}>{note}</Text>}
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 40 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.text },
    emptySubtext: { fontSize: 13, color: c.textMuted, marginTop: 4, textAlign: 'center' },

    monthBar: { paddingBottom: 8 },
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

    netCard: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: c.accent,
      padding: 16,
      marginBottom: 24,
    },
    netLabel: { fontSize: 12, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    netValue: {
      fontSize: 30,
      fontWeight: '800',
      color: c.text,
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    netMeta: { fontSize: 12, color: c.textMuted, marginTop: 4, fontVariant: ['tabular-nums'] },

    section: { marginBottom: 24 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    sectionNote: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginTop: 8 },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowLeft: { flex: 1, paddingRight: 12 },
    label: { fontSize: 15, color: c.text },
    // The workings line is what makes a disagreement traceable to one row.
    workings: { fontSize: 11, color: c.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
    value: { fontSize: 15, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
    valueMuted: { color: c.textMuted, fontWeight: '400' },
    valueNegative: { color: c.danger },

    subtotalRow: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: c.accent, marginTop: 2 },
    subtotalLabel: { fontWeight: '700' },
    subtotalValue: { fontSize: 18, fontWeight: '800' },

    disclaimer: { fontSize: 11, color: c.textMuted, lineHeight: 16, marginTop: 4 },
  });
