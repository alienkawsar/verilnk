"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCentsToDecimalString = void 0;
// Discovery note (backend/src/utils/currency.ts):
// Billing persistence uses integer cents; exports should render fixed 2-decimal strings for human-readable currency.
const formatCentsToDecimalString = (amountCents) => {
    if (amountCents === null || amountCents === undefined)
        return '';
    if (!Number.isFinite(amountCents))
        return '';
    return (amountCents / 100).toFixed(2);
};
exports.formatCentsToDecimalString = formatCentsToDecimalString;
