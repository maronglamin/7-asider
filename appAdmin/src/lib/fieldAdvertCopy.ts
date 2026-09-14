export type FlyerField = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  pricePerHour?: number | null;
  surfaceType?: string | null;
  size?: string | null;
  hasLights?: boolean;
  description?: string | null;
  thumbnail?: string | null;
  images?: Array<{ url: string }>;
};

export type FlyerOrientation = 'portrait' | 'landscape';

export function formatFieldLocation(field: Pick<FlyerField, 'city' | 'address'>) {
  return [field.address, field.city].filter(Boolean).join(', ') || 'Location on request';
}

export function formatFieldPrice(field: Pick<FlyerField, 'pricePerHour'>) {
  if (field.pricePerHour == null || !Number.isFinite(field.pricePerHour)) return null;
  return `GMD ${Number(field.pricePerHour).toLocaleString()}/hour`;
}
