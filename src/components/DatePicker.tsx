import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, useAppTheme } from '@/src/theme';

export interface DatePickerProps {
  /** "YYYY-MM-DD" to open on. */
  initialDate: string;
  onPick: (date: string) => void;
  onCancel: () => void;
}

/**
 * A standalone date picker, unlike `DateField` which is bound to a react-hook-form control.
 *
 * On iOS the spinner is rendered inline with its own confirm button, because a spinner reports
 * every intermediate value as the wheel turns — jumping the list on each of those would be
 * seasick. Android's picker is already a dialog with its own OK, so a confirmed date applies
 * straight away.
 */
export function DatePicker({ initialDate, onPick, onCancel }: DatePickerProps) {
  const { dark, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pending, setPending] = useState(initialDate);

  return (
    <View style={styles.panel}>
      <DateTimePicker
        value={new Date(`${pending}T00:00:00Z`)}
        mode="date"
        themeVariant={dark ? 'dark' : 'light'}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={(event, selectedDate) => {
          if (event.type !== 'set' || !selectedDate) {
            onCancel();
            return;
          }
          const date = selectedDate.toISOString().slice(0, 10);
          if (Platform.OS === 'ios') setPending(date);
          else onPick(date);
        }}
      />
      {Platform.OS === 'ios' && (
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={onCancel}>
            <Text style={styles.actionText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.action, styles.primaryAction]} onPress={() => onPick(pending)}>
            <Text style={styles.primaryActionText}>Jump to {pending}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    panel: {
      backgroundColor: c.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      paddingBottom: 8,
    },
    actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
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
  });
