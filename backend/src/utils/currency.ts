// Discovery note (backend/src/utils/currency.ts):
// Billing persistence uses integer cents; exports should render fixed 2-decimal strings for human-readable currency.
export const formatCentsToDecimalString = (amountCents: number | null | undefined): string => {
    if (amountCents === null || amountCents === undefined) return '';
    if (!Number.isFinite(amountCents)) return '';
    return (amountCents / 100).toFixed(2);
};
