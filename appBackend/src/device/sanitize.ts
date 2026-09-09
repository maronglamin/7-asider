export function truncateOptionalString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function truncateRequiredString(value: unknown, maxLength: number): string {
  const truncated = truncateOptionalString(value, maxLength);
  return truncated ?? '';
}
