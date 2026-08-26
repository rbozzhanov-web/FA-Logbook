import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatMoney } from '@/src/lib/pay/format';
import { DeadheadBasis, NightBasis, PayScheme, PayTier, describeTier } from '@/src/lib/pay/payScheme';
import { AppColors, useAppTheme } from '@/src/theme';

interface PaySchemeFieldProps {
  value: PayScheme;
  onChange: (scheme: PayScheme) => void;
}

/**
 * Editor for the pay agreement.
 *
 * Every term is editable because none of it is a fact about flying — the rate, the thresholds,
 * the multipliers and the deduction percentages are all clauses of a contract that differs
 * between airlines, grades and years. Hard-coding any of them would make the whole calculation
 * useful to exactly one person for exactly as long as their agreement lasts.
 */
export function PaySchemeField({ value, onChange }: PaySchemeFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <NumberField
        label="Hourly rate (₸)"
        value={value.hourlyRate}
        onCommit={(hourlyRate) => onChange({ ...value, hourlyRate })}
      />
      <View style={styles.row}>
        <NumberField
          label="Salary (₸)"
          value={value.monthlySalary}
          onCommit={(monthlySalary) => onChange({ ...value, monthlySalary })}
          style={styles.half}
        />
        <NumberField
          label="Travel allowance (₸)"
          value={value.monthlyTransport}
          onCommit={(monthlyTransport) => onChange({ ...value, monthlyTransport })}
          style={styles.half}
        />
      </View>
      <Toggle
        label="Prorate salary and allowance by sick / unfit days"
        value={value.proratesFixedPayByAbsence}
        onChange={(proratesFixedPayByAbsence) => onChange({ ...value, proratesFixedPayByAbsence })}
      />

      <Text style={styles.groupTitle}>Sick pay</Text>
      <NumberField
        label="Daily rate (₸)"
        value={value.dailySickPayRate}
        onCommit={(dailySickPayRate) => onChange({ ...value, dailySickPayRate })}
      />
      <Text style={styles.hint}>
        Kazakhstani practice bases this on average earnings over the trailing 12 months, which
        can't be reconstructed from the roster alone — enter your own real rate here. Left at 0,
        sick days are unpaid.
      </Text>

      <TierEditor
        title="Hour bands"
        unit="h"
        tiers={value.hourTiers}
        onChange={(hourTiers) => onChange({ ...value, hourTiers })}
      />

      <TierEditor
        title="Sector bands"
        unit="sectors"
        tiers={value.sectorTiers}
        onChange={(sectorTiers) => onChange({ ...value, sectorTiers })}
      />

      <Text style={styles.groupTitle}>Night</Text>
      <View style={styles.row}>
        <NumberField
          label="Rate multiplier"
          value={value.nightMultiplier}
          onCommit={(nightMultiplier) => onChange({ ...value, nightMultiplier })}
          style={styles.half}
        />
        <View style={styles.half}>
          <Text style={styles.label}>Counted as</Text>
          <Segmented<NightBasis>
            options={[
              { value: 'halfBlock', label: 'Half of block' },
              { value: 'contractual', label: 'Clock rule' },
              { value: 'actual', label: 'Real darkness' },
            ]}
            selected={value.nightBasis}
            onSelect={(nightBasis) => onChange({ ...value, nightBasis })}
          />
        </View>
      </View>

      <Text style={styles.groupTitle}>Positioning</Text>
      <View style={styles.row}>
        <NumberField
          label="Rate multiplier"
          value={value.deadheadMultiplier}
          onCommit={(deadheadMultiplier) => onChange({ ...value, deadheadMultiplier })}
          style={styles.half}
        />
        <View style={styles.half}>
          <Text style={styles.label}>Paid by</Text>
          <Segmented<DeadheadBasis>
            options={[
              { value: 'hours', label: 'Hours' },
              { value: 'sectors', label: 'Sectors' },
            ]}
            selected={value.deadheadBasis}
            onSelect={(deadheadBasis) => onChange({ ...value, deadheadBasis })}
          />
        </View>
      </View>

      <Text style={styles.groupTitle}>Deductions</Text>
      <View style={styles.row}>
        <PercentField
          label="ОСМС"
          value={value.osmsRate}
          onCommit={(osmsRate) => onChange({ ...value, osmsRate })}
          style={styles.third}
        />
        <PercentField
          label="ОПВ"
          value={value.opvRate}
          onCommit={(opvRate) => onChange({ ...value, opvRate })}
          style={styles.third}
        />
        <PercentField
          label="ИПН"
          value={value.ipnRate}
          onCommit={(ipnRate) => onChange({ ...value, ipnRate })}
          style={styles.third}
        />
      </View>
      <Text style={styles.hint}>
        ОСМС and ОПВ are each taken straight off the gross. ИПН is taken from what they, and the
        standard deduction below, leave.
      </Text>
      <NumberField
        label="ИПН standard deduction (₸)"
        value={value.ipnStandardDeduction}
        onCommit={(ipnStandardDeduction) => onChange({ ...value, ipnStandardDeduction })}
      />
      <Text style={styles.hint}>
        A legally set figure tied to Kazakhstan's yearly minimum-calculation-index update — re-enter
        it when it changes.
      </Text>
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The bands, as rows of "up to N × multiplier".
 *
 * The last band has no upper bound and says so: anything past the top printed band still has to
 * be paid, and a band list that simply stopped would drop those hours silently.
 */
function TierEditor({
  title,
  unit,
  tiers,
  onChange,
}: {
  title: string;
  unit: 'h' | 'sectors';
  tiers: PayTier[];
  onChange: (tiers: PayTier[]) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const update = (index: number, patch: Partial<PayTier>) => {
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  };

  return (
    <View>
      <Text style={styles.groupTitle}>{title}</Text>
      {tiers.map((tier, index) => (
        <View key={index} style={styles.tierRow}>
          <Text style={styles.tierLabel}>{describeTier(tiers, index, unit)}</Text>
          {tier.upTo !== undefined ? (
            <CompactNumber
              value={tier.upTo}
              onCommit={(upTo) => update(index, { upTo })}
              suffix={unit === 'h' ? 'h' : ''}
            />
          ) : (
            <Text style={styles.tierOpen}>open</Text>
          )}
          <Text style={styles.tierTimes}>×</Text>
          <CompactNumber value={tier.multiplier} onCommit={(multiplier) => update(index, { multiplier })} />
        </View>
      ))}
    </View>
  );
}

function Segmented<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.segment, selected === option.value && styles.segmentActive]}
          onPress={() => onSelect(option.value)}
        >
          <Text style={[styles.segmentText, selected === option.value && styles.segmentTextActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A number field held as text while it is being typed.
 *
 * Committing on every keystroke would turn "3100" into 3, then 31, then 310 on the way — and
 * each of those is a valid scheme that briefly recomputes every payslip in the app.
 */
function useDraft(value: number, format: (value: number) => string) {
  const [draft, setDraft] = useState(() => format(value));
  useEffect(() => setDraft(format(value)), [value]);
  return [draft, setDraft] as const;
}

function NumberField({
  label,
  value,
  onCommit,
  style,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  style?: object;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useDraft(value, (v) => String(v));

  const commit = () => {
    const parsed = parseNumber(draft);
    if (parsed === undefined) setDraft(String(value));
    else onCommit(parsed);
  };

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.placeholder}
      />
      <Text style={styles.fieldHint}>{formatMoney(value)}</Text>
    </View>
  );
}

function PercentField({
  label,
  value,
  onCommit,
  style,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  style?: object;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Shown as a percentage and stored as a fraction: "2" on screen is 0.02 in the scheme.
  const [draft, setDraft] = useDraft(value, (v) => String(Math.round(v * 1000) / 10));

  const commit = () => {
    const parsed = parseNumber(draft);
    if (parsed === undefined) setDraft(String(Math.round(value * 1000) / 10));
    else onCommit(parsed / 100);
  };

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label} %</Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.placeholder}
      />
    </View>
  );
}

function CompactNumber({
  value,
  onCommit,
  suffix,
}: {
  value: number;
  onCommit: (value: number) => void;
  suffix?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useDraft(value, (v) => String(v));

  const commit = () => {
    const parsed = parseNumber(draft);
    if (parsed === undefined) setDraft(String(value));
    else onCommit(parsed);
  };

  return (
    <View style={styles.compactWrap}>
      <TextInput
        style={styles.compactInput}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.placeholder}
      />
      {suffix ? <Text style={styles.compactSuffix}>{suffix}</Text> : null}
    </View>
  );
}

/** Accepts a comma as the decimal separator, which is what a Russian keyboard offers first. */
function parseNumber(raw: string): number | undefined {
  const parsed = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    half: { flex: 1 },
    third: { flex: 1 },
    field: { marginBottom: 12, flex: 1 },
    label: { fontSize: 13, color: c.textMuted, marginBottom: 4 },
    fieldHint: { fontSize: 11, color: c.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
    input: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    groupTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 8,
      marginBottom: 8,
    },
    hint: { fontSize: 12, color: c.textMuted, lineHeight: 17, marginTop: 2, marginBottom: 8 },

    tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    tierLabel: { flex: 1, fontSize: 14, color: c.text },
    tierOpen: { width: 64, fontSize: 13, color: c.textMuted, textAlign: 'center' },
    tierTimes: { fontSize: 14, color: c.textMuted },
    compactWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    compactInput: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      width: 64,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    compactSuffix: { fontSize: 12, color: c.textMuted, width: 10 },

    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      overflow: 'hidden',
    },
    segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: c.card },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { color: c.textMuted, fontWeight: '600', fontSize: 12 },
    segmentTextActive: { color: c.onPrimary },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    toggleTrack: {
      width: 40,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.inputBorder,
      padding: 2,
      justifyContent: 'center',
    },
    toggleTrackActive: { backgroundColor: c.primary },
    toggleThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.card,
    },
    toggleThumbActive: { alignSelf: 'flex-end' },
    toggleLabel: { flex: 1, fontSize: 13, color: c.text },
  });
