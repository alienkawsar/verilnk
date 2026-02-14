"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProvider = void 0;
class MockProvider {
    async createCheckout(payload) {
        return {
            provider: 'mock',
            action: 'createCheckout',
            payload
        };
    }
    async verifyPayment(payload) {
        return {
            provider: 'mock',
            action: 'verifyPayment',
            payload
        };
    }
    async refund(payload) {
        return {
            provider: 'mock',
            action: 'refund',
            payload
        };
    }
    async getStatus(payload) {
        return {
            provider: 'mock',
            action: 'getStatus',
            payload
        };
    }
}
exports.MockProvider = MockProvider;
