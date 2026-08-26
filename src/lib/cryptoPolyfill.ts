import * as ExpoCrypto from 'expo-crypto';

/**
 * Hermes ships no `crypto` global, and Expo's winter runtime doesn't add one (it installs URL,
 * TextDecoder, DOMException, structuredClone — see expo/src/winter/runtime.native.ts). Plenty of
 * npm packages assume it exists anyway: uuid@14 reads `crypto.randomUUID` with no guard at all,
 * so the first id generated on device throws "Property 'crypto' doesn't exist".
 *
 * expo-crypto backs both functions with a real CSPRNG, so uuid keeps its uniqueness guarantees.
 * Web and Node already provide `crypto`, so this is a no-op there.
 *
 * Import this before anything that might generate an id — it's the first import of app/_layout.tsx.
 */
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: ExpoCrypto.getRandomValues,
      randomUUID: ExpoCrypto.randomUUID,
    },
    configurable: true,
    enumerable: false,
    writable: false,
  });
}
