/** Book-facing copy when the field owner cannot receive directPay yet (not linked, no wallets, etc.). */
export const EASYPAY_OWNER_PAYMENT_NOT_READY =
  'The field owner has not yet provided a payment method to receive payment for this booking. Please contact them or use another way to pay.';

export const EASYPAY_SERVER_NOT_CONFIGURED =
  'Online payment is not available on the service right now. Please try again later.';

export function isBookingPaid(paymentStatus: unknown): boolean {
  return String(paymentStatus || '').toUpperCase() === 'PAID';
}

export function isEasypayAlreadyPaidMessage(rawMessage: string | null | undefined): boolean {
  return /already paid|partner.*booking.*paid/i.test(String(rawMessage || ''));
}

/** Maps directPay/Easypay prepare API errors to short, non-technical text for the pay sheet. */
export function friendlyEasypayPrepareError(rawMessage: string | null | undefined): string {
  const m = String(rawMessage || '').trim();
  if (!m) return 'We could not prepare payment. Please try again.';
  if (/(Easypay|directPay) payments are not configured on this server/i.test(m)) {
    return EASYPAY_SERVER_NOT_CONFIGURED;
  }
  if (
    /cannot accept (Easypay|directPay) payments yet/i.test(m) ||
    /Field owner is not linked to (Easypay|directPay)/i.test(m) ||
    /not linked to (Easypay|directPay)/i.test(m) ||
    /Link To (EasyPay|directPay)/i.test(m) ||
    /Request failed:\s*409/i.test(m)
  ) {
    return EASYPAY_OWNER_PAYMENT_NOT_READY;
  }
  return m;
}

/** For Alert dialogs from wallet / APS flows when the owner side is not ready. */
export function friendlyEasypayActionError(rawMessage: string | null | undefined): string {
  const m = String(rawMessage || '').trim();
  if (
    /Field owner is not linked to (Easypay|directPay)/i.test(m) ||
    /not linked to (Easypay|directPay)/i.test(m) ||
    /cannot accept (Easypay|directPay) payments yet/i.test(m)
  ) {
    return EASYPAY_OWNER_PAYMENT_NOT_READY;
  }
  return m || 'Something went wrong. Please try again.';
}

/** Wallet (Wave / Yonna) checkout — hide upstream directPay/Easypay HTTP noise and long JSON. */
export function friendlyEasypayWalletError(rawMessage: string | null | undefined): string {
  const owner = friendlyEasypayActionError(rawMessage);
  if (owner === EASYPAY_OWNER_PAYMENT_NOT_READY) return owner;
  const m = String(rawMessage || '').trim();
  if (!m) {
    return 'We could not start this payment. Please try again in a moment or choose another method.';
  }
  if (/no launch URL|no checkout link|checkout link/i.test(m)) {
    return 'We could not open checkout for this payment. Please try again or pick another method.';
  }
  if (/Request failed:\s*5\d\d|failed:\s*5\d\d|(Easypay|directPay)\s+\w+\s+[^\n]+\s+5\d\d/i.test(m)) {
    return 'The payment service is temporarily unavailable. Please try again in a few moments.';
  }
  if (/(Easypay|directPay)|wallet|checkout|payment provider|Request failed/i.test(m)) {
    return 'We could not start this payment. Please try again in a moment or choose another method.';
  }
  return m;
}
