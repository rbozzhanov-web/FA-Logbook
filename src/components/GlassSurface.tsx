import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';

/**
 * Both checks, not one: `isLiquidGlassAvailable` says the app was compiled against iOS 26, while
 * `isGlassEffectAPIAvailable` says the running OS actually exposes the API — some iOS 26 betas
 * ship without it. Resolved once at module load, since neither can change while the app runs.
 *
 * Wrapped because platforms without the native module (Android) throw rather than answering.
 */
export const isGlassAvailable = ((): boolean => {
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

export interface GlassSurfaceProps extends ViewProps {
  /** Air Astana navy/gold at low alpha, so the brand survives the system material. */
  tintColor?: string;
  glassEffectStyle?: 'clear' | 'regular';
  /** Applied only when glass is unavailable — normally the solid background it stands in for. */
  fallbackStyle?: StyleProp<ViewStyle>;
}

/**
 * An iOS 26 Liquid Glass surface that degrades to a plain themed View everywhere else.
 *
 * Note the docs' one hard constraint: `opacity: 0` on the glass view or any ancestor disables the
 * effect outright, so anything that fades one of these must animate a built-in prop instead.
 */
export function GlassSurface({
  tintColor,
  glassEffectStyle = 'regular',
  fallbackStyle,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  if (!isGlassAvailable) {
    return (
      <View style={[style, fallbackStyle]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <GlassView style={style} glassEffectStyle={glassEffectStyle} tintColor={tintColor} {...rest}>
      {children}
    </GlassView>
  );
}
