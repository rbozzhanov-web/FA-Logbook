/**
 * Guards the Hermes-only failure that shipped to a device: uuid@14 reads `crypto.randomUUID`
 * with no guard, and Hermes has no `crypto` global, so generating any id threw
 * "Property 'crypto' doesn't exist". Node and browsers both provide `crypto`, so nothing else
 * in this suite can catch a regression here — these tests delete it to emulate Hermes.
 */
jest.mock('expo-crypto', () => ({
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i += 1) array[i] = i % 256;
    return array;
  },
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

describe('crypto polyfill', () => {
  const original = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    jest.resetModules();
  });

  function loadPolyfillWithoutCryptoGlobal() {
    // @ts-expect-error emulating Hermes, which has no `crypto` global at all
    delete globalThis.crypto;
    jest.isolateModules(() => {
      require('../cryptoPolyfill');
    });
  }

  it('installs a crypto global when the runtime has none', () => {
    loadPolyfillWithoutCryptoGlobal();

    expect(typeof globalThis.crypto.randomUUID).toBe('function');
    expect(typeof globalThis.crypto.getRandomValues).toBe('function');
  });

  it('satisfies the exact expressions uuid@14 evaluates', () => {
    loadPolyfillWithoutCryptoGlobal();

    // uuid/dist/v4.js:4-5 — `if (... && crypto.randomUUID) return crypto.randomUUID();`
    expect(globalThis.crypto.randomUUID).toBeTruthy();
    expect(globalThis.crypto.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);

    // uuid/dist/rng.js:3 — `return crypto.getRandomValues(rnds8);` with a 16-byte buffer
    const filled = globalThis.crypto.getRandomValues(new Uint8Array(16));
    expect(filled).toHaveLength(16);
  });

  it('leaves an existing crypto global alone (web and Node already have one)', () => {
    const existing = { randomUUID: () => 'pre-existing', getRandomValues: <T,>(a: T) => a };
    Object.defineProperty(globalThis, 'crypto', { value: existing, configurable: true });

    jest.isolateModules(() => {
      require('../cryptoPolyfill');
    });

    expect(globalThis.crypto).toBe(existing);
  });
});
