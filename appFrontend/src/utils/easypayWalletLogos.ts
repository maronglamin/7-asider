import type { ImageSourcePropType } from 'react-native';

const waveLogo = require('../../assets/wave.jpeg') as ImageSourcePropType;
const yonnaLogo = require('../../assets/yonna_wallet.jpeg') as ImageSourcePropType;
const apsLogo = require('../../assets/aps_wallet.jpeg') as ImageSourcePropType;

/** Static assets for marketing / directPay link screen (fixed order). */
export const easypayBrandLogos = {
  wave: waveLogo,
  yonna: yonnaLogo,
  aps: apsLogo,
} as const;

export type EasypayWalletLike = {
  code?: string | null;
  name?: string | null;
  checkoutAdapter?: string | null;
};

/**
 * Map Easypay checkout wallet rows to local brand art (code/name/adapter heuristics).
 */
export function easypayWalletLogoSource(w: EasypayWalletLike): ImageSourcePropType | null {
  const hay = `${w.code || ''} ${w.name || ''} ${w.checkoutAdapter || ''}`.toLowerCase();
  if (hay.includes('wave')) return waveLogo;
  if (hay.includes('yonna')) return yonnaLogo;
  if (hay.includes('aps')) return apsLogo;
  return null;
}

/** Only Yonna may use optional payer phone before wallet redirect; Wave must not send a phone. */
export function easypayWalletNeedsPayerPhone(w: EasypayWalletLike): boolean {
  const hay = `${w.code || ''} ${w.name || ''}`.toLowerCase();
  return hay.includes('yonna');
}

export function easypayWalletIsWave(w: EasypayWalletLike): boolean {
  const hay = `${w.code || ''} ${w.name || ''} ${w.checkoutAdapter || ''}`.toLowerCase();
  return hay.includes('wave');
}
