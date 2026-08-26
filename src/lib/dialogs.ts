import { Alert } from 'react-native';

export interface ConfirmOptions {
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * A yes/no dialog as a promise.
 *
 * Deliberately binary: anything with three answers gets split into two separate, clearly labelled
 * buttons on the screen instead, so the destructive choice is something the user goes looking
 * for rather than something sitting one tap away inside a dialog.
 */
export function confirm(title: string, message: string, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string): void {
  Alert.alert(title, message);
}
