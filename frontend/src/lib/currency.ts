const sanitizeCurrencyInput = (value: string) => value.replace(/[$,\s]/g, '');

// Discovery note (frontend/src/lib/currency.ts):
// Billing APIs expose integer cents (amountCents); UI formatting/parsing happens only at display/input boundaries.

export const centsToDecimalString = (amountCents: number): string => {
  if (!Number.isFinite(amountCents)) return '0.00';
  return (amountCents / 100).toFixed(2);
};

export const formatCurrencyFromCents = (
  amountCents: number,
  currency: string = 'USD',
  locale?: string,
): string => {
  if (!Number.isFinite(amountCents)) return `${currency} 0.00`;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${currency} ${centsToDecimalString(amountCents)}`;
  }
};

export const parseDecimalCurrencyToCents = (
  value: string | number,
): number | null => {
  const normalized =
    typeof value === 'number' ? String(value) : sanitizeCurrencyInput(value.trim());

  if (!normalized) return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
};
