/**
 * Air Astana brand tokens, sampled from the shipped app icon so the UI matches it exactly:
 * navy is 100% of android-icon-background.png, and the two golds plus the deep navy are the
 * dominant colours of the mark in android-icon-foreground.png.
 *
 * Kept in its own module, apart from the palette hook, so plain-string consumers — the printed
 * PDF, tests — can have the colours without pulling in expo-router and React.
 */
export const BRAND = {
  navy: '#0B1E3D',
  navyDeep: '#071022',
  gold: '#D9A93B',
  goldLight: '#F2CC7A',
} as const;
