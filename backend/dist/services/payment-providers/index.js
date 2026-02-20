"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentProvider = void 0;
const client_1 = require("@prisma/client");
const mock_provider_1 = require("./mock.provider");
const stripe_provider_1 = require("./stripe.provider");
const sslcommerz_provider_1 = require("./sslcommerz.provider");
const getPaymentProvider = (gateway) => {
    switch (gateway) {
        case client_1.BillingGateway.STRIPE:
            return new stripe_provider_1.StripeProvider();
        case client_1.BillingGateway.SSLCOMMERZ:
            return new sslcommerz_provider_1.SSLCommerzProvider();
        case client_1.BillingGateway.MOCK:
            return new mock_provider_1.MockProvider();
        default:
            return new mock_provider_1.MockProvider();
    }
};
exports.getPaymentProvider = getPaymentProvider;
