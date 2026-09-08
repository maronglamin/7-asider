import { Platform } from 'react-native';
import { AppState, InteractionManager } from 'react-native';

export type BiometricMethod = 'faceId' | 'touchId' | 'androidBiometric' | 'none';

export async function waitForAppActive(): Promise<void> {
  await new Promise<void>((resolve) => {
    const run = () => InteractionManager.runAfterInteractions(() => resolve());

    if (AppState.currentState === 'active') {
      run();
      return;
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscription.remove();
        run();
      }
    });
  });
}

export async function resolveBiometricMethod(): Promise<BiometricMethod> {
  if (Platform.OS === 'web') return 'none';

  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware || !isEnrolled) return 'none';

    if (Platform.OS === 'ios') {
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'faceId';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'touchId';
      }
      return 'faceId';
    }

    return 'androidBiometric';
  } catch {
    return 'none';
  }
}

export function getBiometricLabel(method: BiometricMethod): string {
  switch (method) {
    case 'faceId':
      return 'Face ID';
    case 'touchId':
      return 'Touch ID';
    case 'androidBiometric':
      return 'Biometrics';
    default:
      return '';
  }
}

export function getLockHint(
  method: BiometricMethod,
  showPin: boolean,
): string {
  if (showPin) return 'Enter your PIN to unlock';
  switch (method) {
    case 'faceId':
      return 'Face ID is required to unlock';
    case 'touchId':
      return 'Touch ID is required to unlock';
    case 'androidBiometric':
      return 'Biometric authentication required';
    default:
      return 'Sign in to continue';
  }
}

function getPromptMessage(method: BiometricMethod): string {
  switch (method) {
    case 'faceId':
      return 'Unlock 7a-side with Face ID';
    case 'touchId':
      return 'Unlock 7a-side with Touch ID';
    case 'androidBiometric':
      return 'Unlock 7a-side';
    default:
      return 'Unlock 7a-side';
  }
}

export async function authenticateWithBiometrics(
  method: BiometricMethod,
): Promise<{ success: boolean }> {
  if (Platform.OS === 'web' || method === 'none') {
    return { success: false };
  }

  await waitForAppActive();
  const LocalAuthentication = await import('expo-local-authentication');
  const options =
    Platform.OS === 'ios'
      ? {
          promptMessage: getPromptMessage(method),
          disableDeviceFallback: true,
          fallbackLabel: '',
        }
      : {
          promptMessage: getPromptMessage(method),
          disableDeviceFallback: true,
          biometricsSecurityLevel: 'strong' as const,
          requireConfirmation: false,
          cancelLabel: 'Use PIN',
        };

  return LocalAuthentication.authenticateAsync(options);
}
