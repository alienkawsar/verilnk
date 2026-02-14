import { PaymentProvider } from './provider.interface';

export class SSLCommerzProvider implements PaymentProvider {
    async createCheckout(payload: Record<string, any>) {
        return {
            provider: 'sslcommerz',
            action: 'createCheckout',
            payload,
            stub: true
        };
    }

    async verifyPayment(payload: Record<string, any>) {
        return {
            provider: 'sslcommerz',
            action: 'verifyPayment',
            payload,
            stub: true
        };
    }

    async refund(payload: Record<string, any>) {
        return {
            provider: 'sslcommerz',
            action: 'refund',
            payload,
            stub: true
        };
    }

    async getStatus(payload: Record<string, any>) {
        return {
            provider: 'sslcommerz',
            action: 'getStatus',
            payload,
            stub: true
        };
    }
}
