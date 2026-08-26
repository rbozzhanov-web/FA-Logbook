import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors, useAppTheme } from '@/src/theme';

/**
 * The screen's name, rendered in the content rather than in a navigation header.
 *
 * The native tab bar draws no header of its own, and the web build turns its header off to match,
 * so this is the single place a tab says what it is — as a large title, which is what iOS 26 does
 * anyway. The top inset is applied here because without a header nothing else keeps the title out
 * from under the status bar.
 */
export function ScreenTitle({ title }: { title: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { paddingHorizontal: 16, paddingBottom: 4, backgroundColor: c.background },
    title: { fontSize: 32, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  });
