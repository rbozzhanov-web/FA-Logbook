import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { calculateDayNight } from '@/src/lib/daynight/nightCalc';
import { minutesToHHMM } from '@/src/lib/time';
import {
  EMPTY_FORM_VALUES,
  EntryFormValues,
  entryFormSchema,
  formValuesToEntry,
} from '@/src/lib/formSchema';
import { NewLogEntry, listCrewNames } from '@/src/db/queries/entries';
import { AppColors, useAppTheme } from '@/src/theme';
import { SectorKind } from '@/src/types/logbook';
import { CrewNameField } from './CrewNameField';
import { DateField } from './DateField';

interface EntryFormProps {
  initialValues?: EntryFormValues;
  onSubmit: (entry: NewLogEntry) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  submitLabel?: string;
}

const KIND_OPTIONS: { value: SectorKind; label: string; hint: string }[] = [
  { value: 'operating', label: 'Operating', hint: 'Worked the sector as crew. Counts as block time.' },
  { value: 'deadhead', label: 'Deadhead', hint: 'Travelled as a passenger to position. Counted apart from block time.' },
  { value: 'ground', label: 'Ground duty', hint: 'Training, a briefing, a course — duty hours with no flying.' },
];

export function EntryForm({ initialValues, onSubmit, onDelete, submitLabel = 'Save' }: EntryFormProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: initialValues ?? EMPTY_FORM_VALUES,
  });

  const kind = useWatch({ control, name: 'kind' });
  const [computeNote, setComputeNote] = useState<string>();
  // Loaded once per form: the names come from the logbook itself, so they only change when an
  // entry is saved — by which point this form is closing.
  const [crewNames, setCrewNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCrewNames().then((names) => {
      if (!cancelled) setCrewNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Recomputes the sector from its two station-local clock readings.
   *
   * This does the work that makes the whole app worth having: it resolves both times through
   * their stations' timezones into real instants, which gives the sector's true length, and
   * splits that by the sun's actual position along the route.
   */
  const recompute = () => {
    const values = getValues();
    const result = calculateDayNight({
      date: values.date,
      departureAirport: values.departureAirport.toUpperCase(),
      arrivalAirport: values.arrivalAirport.toUpperCase(),
      timeOut: values.timeOut,
      timeIn: values.timeIn,
      arrivalDate: values.arrivalDate || undefined,
    });

    if (!result) {
      setComputeNote(
        'Could not compute — check the date, both station codes, and both times. Times are local at each station.',
      );
      return;
    }

    const field = values.kind === 'deadhead' ? 'deadheadTime' : 'blockTime';
    setValue(field, minutesToHHMM(result.blockMinutes), { shouldDirty: true });
    setValue('dayTime', minutesToHHMM(result.dayMinutes), { shouldDirty: true });
    setValue('nightTime', minutesToHHMM(result.nightMinutes), { shouldDirty: true });
    if (result.arrivalDate !== values.date) {
      setValue('arrivalDate', result.arrivalDate, { shouldDirty: true });
    }

    setComputeNote(
      `${minutesToHHMM(result.blockMinutes)} across the two stations' timezones, split by the sun's real position along the route.`,
    );
  };

  const submit = handleSubmit(async (values) => {
    await onSubmit(formValuesToEntry(values));
  });

  const isGround = kind === 'ground';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="What this was">
        <Controller
          control={control}
          name="kind"
          render={({ field: { onChange, value } }) => (
            <View>
              <View style={styles.segmented}>
                {KIND_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.segment, value === option.value && styles.segmentActive]}
                    onPress={() => onChange(option.value)}
                  >
                    <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>
                {KIND_OPTIONS.find((option) => option.value === value)?.hint}
              </Text>
            </View>
          )}
        />
      </Section>

      <Section title={isGround ? 'Duty' : 'Sector'}>
        <DateField control={control} name="date" label="Date (local at departure)" error={errors.date?.message} />
        {!isGround && (
          <TextField control={control} name="flightNumber" label="Flight number" autoCapitalize="characters" />
        )}
        {isGround && (
          <TextField
            control={control}
            name="dutyCode"
            label="Duty code"
            placeholder="HYGT, SEPT…"
            autoCapitalize="characters"
          />
        )}
        <View style={styles.row}>
          <TextField
            control={control}
            name="departureAirport"
            label={isGround ? 'Station' : 'From'}
            autoCapitalize="characters"
            maxLength={4}
            style={styles.half}
            error={errors.departureAirport?.message}
          />
          <TextField
            control={control}
            name="arrivalAirport"
            label={isGround ? 'Station' : 'To'}
            autoCapitalize="characters"
            maxLength={4}
            style={styles.half}
            error={errors.arrivalAirport?.message}
          />
        </View>
        <Text style={styles.hint}>
          Station codes are kept exactly as you enter them — the same codes your roster uses.
        </Text>
        {!isGround && <TextField control={control} name="aircraftType" label="Aircraft type" placeholder="321, 763…" />}
      </Section>

      <Section title={isGround ? 'Hours' : 'Times (local at each station)'}>
        <View style={styles.row}>
          <TextField control={control} name="timeOut" label={isGround ? 'Start' : 'Out'} placeholder="HH:MM" style={styles.half} />
          <TextField control={control} name="timeIn" label={isGround ? 'End' : 'In'} placeholder="HH:MM" style={styles.half} />
        </View>

        {isGround ? (
          <TextField
            control={control}
            name="groundDutyTime"
            label="Duty time"
            placeholder="HH:MM"
            error={errors.blockTime?.message}
          />
        ) : (
          <>
            <DateField
              control={control}
              name="arrivalDate"
              label="Arrival date (only if it lands on another day)"
              error={errors.arrivalDate?.message}
            />
            <View style={styles.row}>
              <TextField
                control={control}
                name={kind === 'deadhead' ? 'deadheadTime' : 'blockTime'}
                label={kind === 'deadhead' ? 'Deadhead time' : 'Block time'}
                placeholder="HH:MM"
                style={styles.half}
                error={errors.blockTime?.message}
              />
              <TextField control={control} name="position" label="Rank operated" placeholder="FJ, PU…" autoCapitalize="characters" style={styles.half} />
            </View>

            <Pressable style={styles.recalcButton} onPress={recompute}>
              <Text style={styles.recalcButtonText}>Compute block time, day &amp; night</Text>
            </Pressable>
            {computeNote && <Text style={styles.hint}>{computeNote}</Text>}

            <View style={[styles.row, styles.spacedRow]}>
              <TextField control={control} name="dayTime" label="Day" placeholder="HH:MM" style={styles.half} />
              <TextField
                control={control}
                name="nightTime"
                label="Night"
                placeholder="HH:MM"
                style={styles.half}
                error={errors.nightTime?.message}
              />
            </View>
          </>
        )}
      </Section>

      <Section title="Duty period">
        <View style={styles.row}>
          <DateField control={control} name="dutyStartDate" label="Report date" error={errors.dutyStartDate?.message} />
          <TextField control={control} name="dutyStartTime" label="Report time" placeholder="HH:MM" style={styles.half} />
        </View>
        <View style={styles.row}>
          <DateField control={control} name="dutyEndDate" label="Release date" error={errors.dutyEndDate?.message} />
          <TextField control={control} name="dutyEndTime" label="Release time" placeholder="HH:MM" style={styles.half} />
        </View>
        <Text style={styles.hint}>
          Duty hours are counted once per duty, so a multi-sector day is not totalled several times
          over. Give every sector of the same duty the same report and release times.
        </Text>
      </Section>

      {!isGround && (
        <Section title="Crew &amp; remarks">
          <CrewNameField control={control} name="captainName" label="Captain" suggestions={crewNames} />
          <CrewNameField control={control} name="purserName" label="Purser" suggestions={crewNames} />
          <CrewNameField control={control} name="otherCrewNames" label="Other crew" suggestions={crewNames} />
          <TextField control={control} name="remarks" label="Remarks" multiline />
        </Section>
      )}

      {isGround && (
        <Section title="Remarks">
          <TextField control={control} name="remarks" label="Remarks" multiline />
        </Section>
      )}

      <Pressable style={styles.submitButton} onPress={submit} disabled={isSubmitting}>
        <Text style={styles.submitButtonText}>{isSubmitting ? 'Saving…' : submitLabel}</Text>
      </Pressable>

      {onDelete && (
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>Delete entry</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface TextFieldProps {
  control: ReturnType<typeof useForm<EntryFormValues>>['control'];
  name: keyof EntryFormValues;
  label: string;
  placeholder?: string;
  error?: string;
  style?: object;
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
  multiline?: boolean;
}

function TextField({
  control,
  name,
  label,
  placeholder,
  error,
  style,
  autoCapitalize = 'none',
  keyboardType = 'default',
  maxLength,
  multiline,
}: TextFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={[styles.field, style]}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={[styles.input, multiline && styles.multilineInput]}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType}
            maxLength={maxLength}
            multiline={multiline}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      )}
    />
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 48 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: c.text },
    row: { flexDirection: 'row', gap: 12 },
    spacedRow: { marginTop: 12 },
    field: { marginBottom: 12, flex: 1 },
    half: { flex: 1 },
    label: { fontSize: 13, color: c.textMuted, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.card,
      color: c.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    multilineInput: { minHeight: 80, textAlignVertical: 'top' },
    errorText: { color: c.danger, fontSize: 12, marginTop: 4 },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 },

    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      overflow: 'hidden',
    },
    segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: c.card },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
    segmentTextActive: { color: c.onPrimary },

    recalcButton: {
      marginTop: 8,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    recalcButtonText: { color: c.text, fontWeight: '600' },
    submitButton: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    submitButtonText: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
    deleteButton: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
    deleteButtonText: { color: c.danger, fontWeight: '600' },
  });
