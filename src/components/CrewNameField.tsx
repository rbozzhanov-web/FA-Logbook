import { useMemo, useState } from 'react';
import { Control, Controller } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { filterCrewNames } from '@/src/lib/crewNames';
import { EntryFormValues } from '@/src/lib/formSchema';
import { AppColors, useAppTheme } from '@/src/theme';

interface CrewNameFieldProps {
  control: Control<EntryFormValues>;
  name: 'captainName' | 'purserName' | 'otherCrewNames';
  label: string;
  /** Every name already in the logbook, most-flown-with first. */
  suggestions: string[];
}

/**
 * A name field that offers the crew already in the logbook once typing starts.
 *
 * Suggestions render inline, below the input, rather than as a floating overlay: the form is a
 * plain ScrollView with no layering, and an absolutely-positioned dropdown is exactly the thing
 * that ends up clipped by the next field. Pushing the form down a little is the boring option
 * that works on every platform.
 */
export function CrewNameField({ control, name, label, suggestions }: CrewNameFieldProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Visibility is driven by typing and cleared on selection — never by onBlur, which fires before
  // the press and would make every suggestion untappable.
  const [isTyping, setIsTyping] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => {
        const matches = isTyping ? filterCrewNames(suggestions, value ?? '') : [];

        return (
          <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(text) => {
                setIsTyping(true);
                onChange(text);
              }}
              onBlur={onBlur}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {matches.length > 0 && (
              <View style={styles.suggestions}>
                {matches.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={styles.suggestion}
                    onPress={() => {
                      onChange(suggestion);
                      setIsTyping(false);
                    }}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    // No flex here, unlike TextField: these fields are full width and their height changes as
    // suggestions appear. A flex basis makes the siblings share a fixed height instead, and the
    // suggestion list then draws over the next field rather than moving it down.
    field: { marginBottom: 12 },
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
    suggestions: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 8,
      backgroundColor: c.surfaceAlt,
      overflow: 'hidden',
    },
    suggestion: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    suggestionText: { color: c.text, fontSize: 14 },
  });
