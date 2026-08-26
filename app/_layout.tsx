// Must come first: installs the `crypto` global Hermes lacks, before anything generates an id.
import '@/src/lib/cryptoPolyfill';

import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDatabaseMigrations } from '@/src/db/migrate';
import { startAutoBackup } from '@/src/lib/backup/autoBackup';
import { AppColors, navigationTheme, useAppTheme } from '@/src/theme';

/**
 * Expo Router wraps a route in this boundary only if the route file exports a component named
 * `ErrorBoundary` (receives `{ error, retry }`) — without it, any uncaught render/effect error
 * anywhere in the app unmounts the tree to a blank screen with no visible message.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{error.message}</Text>
      <Pressable onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const { dark, colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const theme = useMemo(() => navigationTheme(dark), [dark]);
  const { success, error } = useDatabaseMigrations();

  // The root view sits behind everything React renders, including during launch. Left at its
  // default it is white, which flashes on a dark-mode start before the first frame paints.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  // Keeps a restorable copy of the logbook on disk, rewritten (debounced) whenever data changes.
  // Only once the schema is ready — backing up a database that has not migrated yet would write
  // an empty file over a good one.
  useEffect(() => {
    if (!success) return;
    return startAutoBackup();
  }, [success]);

  // ThemeProvider is the supported override point: ExpoRoot renders its own NavigationContainer
  // and never passes a theme, so headers/tab bar read this context instead.
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Database error</Text>
          <Text style={styles.errorMessage}>{error.message}</Text>
        </View>
      ) : !success ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <Stack screenOptions={{ headerTitleStyle: { fontWeight: '600' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/new" options={{ title: 'New entry' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Edit entry' }} />
          <Stack.Screen name="import/pick" options={{ title: 'Import roster' }} />
          <Stack.Screen name="import/review" options={{ title: 'Review import' }} />
          <Stack.Screen name="import/review-edit/[index]" options={{ title: 'Edit entry' }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: c.background,
    },
    errorTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: c.text },
    errorMessage: { color: c.danger, textAlign: 'center' },
    retryButton: {
      marginTop: 16,
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    retryButtonText: { color: c.onPrimary, fontWeight: '700' },
  });
