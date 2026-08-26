import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Control, Controller, useWatch } from 'react-hook-form';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryFormValues } from '@/src/lib/formSchema';
import { AppColors, useAppTheme } from '@/src/theme';

export interface DateFieldProps {
  control: Control<EntryFormValues>;
  name: 'date' | 'arrivalDate' | 'dutyStartDate' | 'dutyEndDate';
  label: string;
  error?: string;
}

export function DateField({ control, name, label, error }: DateFieldProps) {
  const { dark, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showPicker, setShowPicker] = useState(false);
  const value = useWatch({ control, name });

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange } }) => (
        <View style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
            <Text style={styles.valueText}>{value || 'Select date'}</Text>
          </Pressable>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {showPicker && (
            <DateTimePicker
              value={value ? new Date(`${value}T00:00:00Z`) : new Date()}
              mode="date"
              themeVariant={dark ? 'dark' : 'light'}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                setShowPicker(Platform.OS === 'ios');
                if (event.type === 'set' && selectedDate) {
                  onChange(selectedDate.toISOString().slice(0, 10));
                } else {
                  setShowPicker(false);
                }
              }}
            />
          )}
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
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    valueText: { fontSize: 15, color: c.text },
    errorText: { color: c.danger, fontSize: 12, marginTop: 4 },
  });
