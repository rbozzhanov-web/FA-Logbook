import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, useAppTheme } from '@/src/theme';

/**
 * PDF import relies on react-native-webview (to run pdf.js) and native file-system APIs, neither
 * of which have web support — this stays iOS-only for now. See app/import/pick.tsx for native.
 */
export default function ImportPickWebScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Not available on web yet</Text>
      <Text style={styles.description}>
        Roster import relies on some iOS-only capabilities. For now, use the iOS app to import your
        crew schedule — manual entry, your logbook, and totals all work here on the web.
      </Text>
    </View>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, padding: 24 },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: c.text },
    description: { fontSize: 15, color: c.text, lineHeight: 21 },
  });
