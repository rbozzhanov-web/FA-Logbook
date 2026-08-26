import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { BRAND } from './brand';

export { BRAND };

export interface AppColors {
  background: string;
  card: string;
  /** Slightly offset from `card`, for summary bars and section headers. */
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  /** Primary action colour. Navy on light, gold on dark — see the contrast note below. */
  primary: string;
  onPrimary: string;
  /** Brand accent for rules and highlights. Never used for small text on light. */
  accent: string;
  inputBorder: string;
  placeholder: string;
  danger: string;
  success: string;
  warning: string;
  badgeOk: string;
  badgeOkText: string;
  badgeWarn: string;
  badgeWarnText: string;
  badgeBad: string;
  badgeBadText: string;
  badgeNeutral: string;
  badgeNeutralText: string;
}

/**
 * Gold (#D9A93B) only reaches ~2.2:1 against white, so on light it is confined to fills, rules
 * and accents while navy carries anything that has to be read. On dark the relationship inverts:
 * gold over navy-deep reads cleanly, so it becomes the primary action colour.
 */
const light: AppColors = {
  background: '#F7F8FA',
  card: '#FFFFFF',
  surfaceAlt: '#EEF1F6',
  text: BRAND.navy,
  textMuted: '#5A6577',
  border: '#D8DEE7',
  primary: BRAND.navy,
  onPrimary: '#FFFFFF',
  accent: BRAND.gold,
  inputBorder: '#C3CBD8',
  placeholder: '#98A2B3',
  danger: '#C0261F',
  success: '#1A7A1A',
  warning: '#A15C00',
  badgeOk: '#E6F4EA',
  badgeOkText: '#1A7A1A',
  badgeWarn: '#FEF3E0',
  badgeWarnText: '#A15C00',
  badgeBad: '#FDE8E8',
  badgeBadText: '#C0261F',
  badgeNeutral: '#E7EAF0',
  badgeNeutralText: '#5A6577',
};

const dark: AppColors = {
  background: BRAND.navyDeep,
  card: BRAND.navy,
  surfaceAlt: '#122647',
  text: '#E8ECF3',
  textMuted: '#9AA8BF',
  border: '#1E3357',
  primary: BRAND.gold,
  onPrimary: BRAND.navyDeep,
  accent: BRAND.gold,
  inputBorder: '#2A4068',
  placeholder: '#6F7F9B',
  danger: '#FF6B63',
  success: '#5FD07A',
  warning: '#E8B45C',
  badgeOk: '#12301C',
  badgeOkText: '#5FD07A',
  badgeWarn: '#33260E',
  badgeWarnText: '#E8B45C',
  badgeBad: '#3A1614',
  badgeBadText: '#FF6B63',
  badgeNeutral: '#1B2C4A',
  badgeNeutralText: '#9AA8BF',
};

export function useAppTheme(): { dark: boolean; colors: AppColors } {
  const isDark = useColorScheme() === 'dark';
  return { dark: isDark, colors: isDark ? dark : light };
}

/**
 * React Navigation theme for headers, tab bar and screen backgrounds. Spreads the built-in themes
 * so the required `fonts` block is inherited rather than reinvented.
 */
export function navigationTheme(isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  const c = isDark ? dark : light;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.card,
      text: c.text,
      border: c.border,
      notification: c.danger,
    },
  };
}
