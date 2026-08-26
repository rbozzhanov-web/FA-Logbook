import {
  DEFAULT_NIGHT_WINDOW,
  NightWindow,
  parseNightWindow,
  serializeNightWindow,
} from '@/src/lib/daynight/nightWindow';
import {
  DEFAULT_PAY_SCHEME,
  PayScheme,
  parsePayScheme,
  serializePayScheme,
} from '@/src/lib/pay/payScheme';
import { readPreference, writePreference } from '@/src/db/queries/preferences';
import { bumpDataVersion } from '@/src/db/dataVersion';

const NIGHT_WINDOW_KEY = 'nightWindow';
const PAY_SCHEME_KEY = 'payScheme';

/**
 * Reading and writing the night window. The window's own format lives with the calculation in
 * `daynight/nightWindow.ts`; this file is only the storage around it, which keeps the printed
 * logbook and the tests clear of the database layer.
 */

/**
 * The configured night window.
 *
 * Falls back to the default rather than failing: a malformed or missing setting should leave the
 * app reporting night hours under a stated rule, not reporting none.
 */
export async function readNightWindow(): Promise<NightWindow> {
  const raw = await readPreference(NIGHT_WINDOW_KEY);
  return parseNightWindow(raw) ?? DEFAULT_NIGHT_WINDOW;
}

export async function writeNightWindow(window: NightWindow): Promise<void> {
  await writePreference(NIGHT_WINDOW_KEY, serializeNightWindow(window));
  // Every night total in the app is derived from this, so screens have to re-read.
  bumpDataVersion();
}

/**
 * The stored pay agreement.
 *
 * Falls back to the default scheme rather than failing, on the same reasoning as the night
 * window: a malformed setting should leave the app computing under a stated agreement, not
 * refusing to compute at all.
 */
export async function readPayScheme(): Promise<PayScheme> {
  return parsePayScheme(await readPreference(PAY_SCHEME_KEY)) ?? DEFAULT_PAY_SCHEME;
}

export async function writePayScheme(scheme: PayScheme): Promise<void> {
  await writePreference(PAY_SCHEME_KEY, serializePayScheme(scheme));
  // Every pay figure in the app derives from this, so screens have to re-read.
  bumpDataVersion();
}
