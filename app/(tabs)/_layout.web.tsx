import { Tabs } from 'expo-router';

import { useAppTheme } from '@/src/theme';

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        // No header: the native tab bar draws none, and each screen renders its own large title
        // through ScreenTitle. Showing one here would print every title twice on web.
        headerShown: false,
        // Everything else (backgrounds, borders, active tint) comes from the navigation theme;
        // the inactive tint is derived internally rather than being a theme field, so it's the
        // one colour that has to be set here.
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Logbook' }} />
      <Tabs.Screen name="totals" options={{ title: 'Totals' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
