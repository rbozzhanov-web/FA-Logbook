import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { NightWindow } from '@/src/lib/daynight/nightWindow';
import { hhmmToMinutes, minutesToHHMM } from '@/src/lib/time';
import { AppColors, useAppTheme } from '@/src/theme';

interface NightWindowFieldProps {
  value: NightWindow;
  onChange: (window: NightWindow) => void;
}

/**
 * Sets the clock rule night hours are counted under.
 *
 * Worth exposing rather than hard-coding, because the rule is not a fact about the world — it is
 * whatever a particular crew agreement says, and it differs between airlines and between grades.
 * The astronomical night figure sits alongside it untouched, so changing this never affects the
 * record of how much was actually flown in darkness.
 */
export function NightWindowField({ value, onChange }: NightWindowFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Held as text while being typed: a half-entered "2" is not a time, and committing on every
  // keystroke would rewrite the setting to 02:00 on the way to 22:00.
  const [start, setStart] = useState(() => minutesToHHMM(value.startMinute));
  const [end, setEnd] = useState(() => minutesToHHMM(value.endMinute));

  useEffect(() => {
    setStart(minutesToHHMM(value.startMinute));
    setEnd(minutesToHHMM(value.endMinute));
  }, [value.startMinute, value.endMinute]);

  const commit = (which: 'start' | 'end', text: string) => {
    const minutes = hhmmToMinutes(text);
    if (minutes === null) {
      // Not a time — put the stored value back rather than leaving a broken string on screen.
      if (which === 'start') setStart(minutesToHHMM(value.startMinute));
      else setEnd(minutesToHHMM(value.endMinute));
      return;
    }
    onChange(which === 'start' ? { ...value, startMinute: minutes } : { ...value, endMinute: minutes });
  };

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>Night starts</Text>
          <TextInput
            style={styles.input}
            value={start}
            onChangeText={setStart}
            onBlur={() => commit('start', start)}
            onSubmitEditing={() => commit('start', start)}
            placeholder="22:00"
            placeholderTextColor={colors.placeholder}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Night ends</Text>
          <TextInput
            style={styles.input}
            value={end}
            onChangeText={setEnd}
            onBlur={() => commit('end', end)}
            onSubmitEditing={() => commit('end', end)}
            placeholder="06:00"
            placeholderTextColor={colors.placeholder}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <Text style={styles.label}>Read on which clock</Text>
      <View style={styles.segmented}>
        <BasisOption
          label="Departure station"
          active={value.basis === 'station'}
          onPress={() => onChange({ ...value, basis: 'station' })}
        />
        <BasisOption
          label="UTC"
          active={value.basis === 'utc'}
          onPress={() => onChange({ ...value, basis: 'utc' })}
        />
      </View>
    </View>
  );
}

function BasisOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    field: { flex: 1, marginBottom: 12 },
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
      fontVariant: ['tabular-nums'],
    },
    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 8,
    },
    segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: c.card },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { color: c.textMuted, fontWeight: '600', fontSize: 13 },
    segmentTextActive: { color: c.onPrimary },
  });
