import { Alert, Linking, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

let installed = false;
let layoutInstalled = false;

const PWA_LAYOUT_STYLE_ID = '7aside-pwa-layout';

/**
 * RN-web in a PWA often gets a tall document and broken scroll unless the
 * document root is height-constrained; mobile Safari/PWA also needs dvh or
 * -webkit-fill-available instead of plain 100vh/100%.
 */
export function installWebDocumentLayout() {
  if (layoutInstalled || Platform.OS !== 'web' || typeof document === 'undefined') return;
  layoutInstalled = true;

  if (!document.getElementById(PWA_LAYOUT_STYLE_ID)) {
    const el = document.createElement('style');
    el.id = PWA_LAYOUT_STYLE_ID;
    el.textContent = `
      html {
        height: 100%;
        margin: 0;
        overflow: hidden;
        -webkit-text-size-adjust: 100%;
      }
      body {
        display: flex;
        flex-direction: column;
        height: 100%;
        margin: 0;
        overflow: hidden;
        touch-action: pan-x pan-y;
        overscroll-behavior-y: none;
        position: relative;
      }
      #root {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        height: 100%;
        min-height: 100%;
        min-height: -webkit-fill-available;
      }
      @supports (height: 100dvh) {
        html {
          height: 100dvh;
        }
        body {
          height: 100dvh;
          max-height: 100dvh;
        }
        #root {
          height: 100dvh;
          min-height: 100dvh;
          max-height: 100dvh;
        }
      }
    `;
    document.head.appendChild(el);
  }

  let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.setAttribute('name', 'viewport');
    document.head.appendChild(viewport);
  }
  viewport.setAttribute(
    'content',
    'width=device-width, initial-scale=1, viewport-fit=cover',
  );
}

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
