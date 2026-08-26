import type { ConfirmOptions } from './dialogs';

export type { ConfirmOptions };

/**
 * react-native-web does not implement Alert — calling it does nothing at all, which would leave
 * every confirmation on the web build silently unanswered. The browser's own dialogs are the
 * honest equivalent: blocking, and impossible to miss.
 */
export async function confirm(title: string, message: string, _options: ConfirmOptions): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}

export function notify(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}
