import { PaymentProvider } from './provider.interface';

export class MockProvider implements PaymentProvider {
    async createCheckout(payload: Record<string, any>) {
        return {
            provider: 'mock',
            action: 'createCheckout',
            payload
        };
    }

    async verifyPayment(payload: Record<string, any>) {
        return {
            provider: 'mock',
            action: 'verifyPayment',
            payload
        };
    }

    async refund(payload: Record<string, any>) {
        return {
            provider: 'mock',
            action: 'refund',
            payload
        };
    }

    async getStatus(payload: Record<string, any>) {
        return {
            provider: 'mock',
            action: 'getStatus',
            payload
        };
    }
}
