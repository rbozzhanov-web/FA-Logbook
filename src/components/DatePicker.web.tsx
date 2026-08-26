import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppColors, useAppTheme } from '@/src/theme';
import type { DatePickerProps } from './DatePicker';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Web has no native date-picker equivalent — a validated "YYYY-MM-DD" field, as in DateField.web. */
export function DatePicker({ initialDate, onPick, onCancel }: DatePickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState(initialDate);
  const isValid = DATE_PATTERN.test(value);

  return (
    <View style={styles.panel}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.placeholder}
        autoFocus
        onSubmitEditing={() => isValid && onPick(value)}
      />
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onCancel}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.action, styles.primaryAction, !isValid && styles.disabled]}
          disabled={!isValid}
          onPress={() => onPick(value)}
        >
          <Text style={styles.primaryActionText}>Jump</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    panel: {
      backgroundColor: c.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      padding: 16,
      gap: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.background,
      color: c.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    actions: { flexDirection: 'row', gap: 12 },
    action: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    actionText: { color: c.text, fontWeight: '600' },
    primaryAction: { backgroundColor: c.primary, borderColor: c.primary },
    primaryActionText: { color: c.onPrimary, fontWeight: '700' },
    disabled: { opacity: 0.5 },
  });
