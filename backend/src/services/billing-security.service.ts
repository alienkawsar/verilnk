import crypto from 'crypto';

const stableStringify = (payload: Record<string, unknown>) => {
    const sorted = Object.keys(payload)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = payload[key];
            return acc;
        }, {});
    return JSON.stringify(sorted);
};

const computeHmac = (payload: string, secret: string) => {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export const verifyWebhookSignature = (payload: Record<string, unknown>, signature?: string) => {
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

    const ok = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    return { verified: ok, reason: ok ? undefined : 'Signature mismatch' };
};

export const computeInvoiceIntegrity = (params: {
    organizationId: string;
    planType: string;
    amountCents: number;
    currency: string;
}) => {
    return crypto.createHash('sha256')
        .update(stableStringify(params))
        .digest('hex');
};

export const validateInvoiceIntegrity = (params: {
    organizationId?: string;
    planType?: string;
    amountCents: number;
    currency: string;
    integrityHash?: string | null;
}) => {
    if (!params.organizationId || !params.planType || !params.integrityHash) {
        return { valid: false, reason: 'Missing integrity fields' };
    }
    const expected = computeInvoiceIntegrity({
        organizationId: params.organizationId,
        planType: params.planType,
        amountCents: params.amountCents,
        currency: params.currency
    });
    return { valid: expected === params.integrityHash, expected };
};
