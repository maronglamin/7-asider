export const PIN_LENGTH = 4;

let stagedPin: string | null = null;
let currentSecret: string | null = null;
let reauthUntil = 0;
const REAUTH_MS = 5 * 60 * 1000;

export function validatePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits';
  return null;
}

export function stagePin(value: string) {
  stagedPin = value;
}

export function getStagedPin(): string | null {
  return stagedPin;
}

export function clearStagedPin() {
  stagedPin = null;
}

export function markPinReauth(secret: string) {
  currentSecret = secret;
  reauthUntil = Date.now() + REAUTH_MS;
}

export function getCurrentPinSecret(): string | undefined {
  if (!currentSecret || Date.now() > reauthUntil) {
    currentSecret = null;
    reauthUntil = 0;
    return undefined;
  }
  return currentSecret;
}

export function clearPinReauth() {
  currentSecret = null;
  reauthUntil = 0;
}

export function clearPinSetupSession() {
  clearStagedPin();
  clearPinReauth();
}
