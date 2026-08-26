import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * A counter bumped whenever logbook data is written.
 *
 * Screens used to reload on every focus, which re-queried and re-rendered the whole list every
 * time you switched tabs even though nothing had changed. Instead they reload only when this
 * version differs from the one their data was loaded at.
 */
let version = 0;
const listeners = new Set<() => void>();

/** Call after any create/update/delete so screens know their data is stale. */
export function bumpDataVersion(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function getDataVersion(): number {
  return version;
}

/**
 * Subscribes outside React — used by the automatic backup, which has to react to writes without
 * a screen being mounted. Returns the unsubscribe.
 */
export function subscribeToDataVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs `load` on first focus, and afterwards only when the data has actually changed.
 *
 * The subscription is registered on mount rather than on focus, and focus is tracked in a ref:
 * a write can land in the gap between focusing and an effect running (boot-time code
 * normalisation does exactly this), and a listener registered later would miss the bump and
 * leave stale rows on screen.
 */
export function useDataRefresh(load: () => void): void {
  const loadedAt = useRef<number | undefined>(undefined);
  const isFocused = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refreshIfStale = useCallback(() => {
    if (!isFocused.current) return;
    if (loadedAt.current === version) return;
    loadedAt.current = version;
    loadRef.current();
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      refreshIfStale();
      return () => {
        isFocused.current = false;
      };
    }, [refreshIfStale]),
  );

  useEffect(() => {
    listeners.add(refreshIfStale);
    return () => {
      listeners.delete(refreshIfStale);
    };
  }, [refreshIfStale]);
}
