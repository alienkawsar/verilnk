import { PaymentProvider } from './provider.interface';

export class StripeProvider implements PaymentProvider {
    async createCheckout(payload: Record<string, any>) {
        return {
            provider: 'stripe',
            action: 'createCheckout',
            payload,
            stub: true
        };
    }

    async verifyPayment(payload: Record<string, any>) {
        return {
            provider: 'stripe',
            action: 'verifyPayment',
            payload,
            stub: true
        };
    }

    async refund(payload: Record<string, any>) {
        return {
            provider: 'stripe',
            action: 'refund',
            payload,
            stub: true
        };
    }

    async getStatus(payload: Record<string, any>) {
        return {
            provider: 'stripe',
            action: 'getStatus',
            payload,
            stub: true
        };
    }
}
