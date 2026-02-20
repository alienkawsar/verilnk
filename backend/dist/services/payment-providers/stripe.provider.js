"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeProvider = void 0;
class StripeProvider {
    async createCheckout(payload) {
        return {
            provider: 'stripe',
            action: 'createCheckout',
            payload,
            stub: true
        };
    }
    async verifyPayment(payload) {
        return {
            provider: 'stripe',
            action: 'verifyPayment',
            payload,
            stub: true
        };
    }
    async refund(payload) {
        return {
            provider: 'stripe',
            action: 'refund',
            payload,
            stub: true
        };
    }
    async getStatus(payload) {
        return {
            provider: 'stripe',
            action: 'getStatus',
            payload,
            stub: true
        };
    }
}
exports.StripeProvider = StripeProvider;
