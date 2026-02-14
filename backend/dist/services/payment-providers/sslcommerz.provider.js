"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSLCommerzProvider = void 0;
class SSLCommerzProvider {
    async createCheckout(payload) {
        return {
            provider: 'sslcommerz',
            action: 'createCheckout',
            payload,
            stub: true
        };
    }
    async verifyPayment(payload) {
        return {
            provider: 'sslcommerz',
            action: 'verifyPayment',
            payload,
            stub: true
        };
    }
    async refund(payload) {
        return {
            provider: 'sslcommerz',
            action: 'refund',
            payload,
            stub: true
        };
    }
    async getStatus(payload) {
        return {
            provider: 'sslcommerz',
            action: 'getStatus',
            payload,
            stub: true
        };
    }
}
exports.SSLCommerzProvider = SSLCommerzProvider;
