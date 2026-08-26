import { View } from 'react-native';

import type { GlassSurfaceProps } from './GlassSurface';

export type { GlassSurfaceProps };

/** A browser has no Liquid Glass, and the native module has no business in the web bundle. */
export const isGlassAvailable = false;

export function GlassSurface({
  tintColor: _tintColor,
  glassEffectStyle: _glassEffectStyle,
  fallbackStyle,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  return (
    <View style={[style, fallbackStyle]} {...rest}>
      {children}
    </View>
  );
}
