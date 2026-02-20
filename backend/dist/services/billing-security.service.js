"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateInvoiceIntegrity = exports.computeInvoiceIntegrity = exports.verifyWebhookSignature = void 0;
const crypto_1 = __importDefault(require("crypto"));
const stableStringify = (payload) => {
    const sorted = Object.keys(payload)
        .sort()
        .reduce((acc, key) => {
        acc[key] = payload[key];
        return acc;
    }, {});
    return JSON.stringify(sorted);
};
const computeHmac = (payload, secret) => {
    return crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
};
const verifyWebhookSignature = (payload, signature) => {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
        return { verified: true, placeholder: true };
    }
    if (!signature) {
        return { verified: false, reason: 'Missing signature' };
    }
    const expected = computeHmac(stableStringify(payload), secret);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length) {
        return { verified: false, reason: 'Signature length mismatch' };
    }
    const ok = crypto_1.default.timingSafeEqual(expectedBuffer, receivedBuffer);
    return { verified: ok, reason: ok ? undefined : 'Signature mismatch' };
};
exports.verifyWebhookSignature = verifyWebhookSignature;
const computeInvoiceIntegrity = (params) => {
    return crypto_1.default.createHash('sha256')
        .update(stableStringify(params))
        .digest('hex');
};
exports.computeInvoiceIntegrity = computeInvoiceIntegrity;
const validateInvoiceIntegrity = (params) => {
    if (!params.organizationId || !params.planType || !params.integrityHash) {
        return { valid: false, reason: 'Missing integrity fields' };
    }
    const expected = (0, exports.computeInvoiceIntegrity)({
        organizationId: params.organizationId,
        planType: params.planType,
        amountCents: params.amountCents,
        currency: params.currency
    });
    return { valid: expected === params.integrityHash, expected };
};
exports.validateInvoiceIntegrity = validateInvoiceIntegrity;
