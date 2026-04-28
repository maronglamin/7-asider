import { Alert, Linking, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

let installed = false;

export function installWebNativeCompat() {
  if (installed || Platform.OS !== 'web') return;
  installed = true;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actionButtons = buttons?.filter((button) => button.style !== 'cancel') || [];
    const cancelButton = buttons?.find((button) => button.style === 'cancel');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const confirmed = window.confirm(text);
    if (confirmed) {
      const preferred = actionButtons.find((button) => button.style === 'destructive') || actionButtons[0];
      preferred?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
  };

  Linking.openURL = async (url: string) => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
  };
}
