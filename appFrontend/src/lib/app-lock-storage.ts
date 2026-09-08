let skipNextAppLock = false;
let pendingCredentialPrompt = false;

/** Call after a fresh OTP sign-in so the user is not prompted again immediately. */
export function markSkipNextAppLock(): void {
  skipNextAppLock = true;
}

export function consumeSkipNextAppLock(): boolean {
  const shouldSkip = skipNextAppLock;
  skipNextAppLock = false;
  return shouldSkip;
}

/** Call after a fresh OTP sign-in to suggest setting an unlock PIN. */
export function markPendingCredentialPrompt(): void {
  pendingCredentialPrompt = true;
}

export function clearPendingCredentialPrompt(): void {
  pendingCredentialPrompt = false;
}

export function hasPendingCredentialPrompt(): boolean {
  return pendingCredentialPrompt;
}
