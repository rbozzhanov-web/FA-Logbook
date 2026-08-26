import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppTheme } from '@/src/theme';

/**
 * The real system tab bar. On iOS 26 that means Liquid Glass drawn by UIKit itself — it derives
 * its background from the list scrolling underneath, which no JS tab bar can imitate, and
 * `minimizeBehavior` gives the collapse-on-scroll the OS's own apps have.
 *
 * `app/(tabs)/_layout.web.tsx` keeps the JS `Tabs` for the published web build, where native tabs
 * fall back to a headless implementation.
 */
export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <NativeTabs
      tintColor={colors.primary}
      minimizeBehavior="onScrollDown"
      labelStyle={{ color: colors.textMuted }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'book.closed', selected: 'book.closed.fill' }} />
        <NativeTabs.Trigger.Label>Logbook</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="totals">
        <NativeTabs.Trigger.Icon sf="sum" />
        <NativeTabs.Trigger.Label>Totals</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pay">
        <NativeTabs.Trigger.Icon sf={{ default: 'banknote', selected: 'banknote.fill' }} />
        <NativeTabs.Trigger.Label>Pay</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
