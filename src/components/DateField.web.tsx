import { useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppColors, useAppTheme } from '@/src/theme';
import type { DateFieldProps } from './DateField';

/** Web has no native date-picker equivalent — a plain validated "YYYY-MM-DD" text field instead. */
export function DateField({ control, name, label, error }: DateFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.placeholder}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      )}
    />
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    field: { marginBottom: 12, flex: 1 },
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
    errorText: { color: c.danger, fontSize: 12, marginTop: 4 },
  });
