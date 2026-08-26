// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required so Metro can inline the .sql migration files Drizzle Kit generates
// (see https://orm.drizzle.team/docs/get-started/expo-new)
config.resolver.sourceExts.push('sql');

// The bundled pdf.js WebView harness (assets/pdfjs/) is loaded by file URI at runtime rather than
// imported, so it ships as assets: viewer.html already matches a default asset extension, and the
// two library files are stored as .mjs.txt (see extractText.ts) to match this one.
//
// Note .mjs itself must NOT be moved out of sourceExts into assetExts: it's a *default* source
// extension, and node_modules ships plenty of real ESM under it — including expo's own
// whatwg-url-minimum, which backs the global URL polyfill. Bundling those as opaque assets
// leaves their imports resolving to asset handles instead of modules, which breaks startup
// before React ever mounts (a blank white screen on device, uncatchable by any error boundary).
config.resolver.assetExts.push('txt');

module.exports = config;
