import { BillingGateway } from '@prisma/client';
import { PaymentProvider } from './provider.interface';
import { MockProvider } from './mock.provider';
import { StripeProvider } from './stripe.provider';
import { SSLCommerzProvider } from './sslcommerz.provider';

export const getPaymentProvider = (gateway: BillingGateway): PaymentProvider => {
    switch (gateway) {
        case BillingGateway.STRIPE:
            return new StripeProvider();
        case BillingGateway.SSLCOMMERZ:
            return new SSLCommerzProvider();
        case BillingGateway.MOCK:
            return new MockProvider();
        default:
            return new MockProvider();
    }
};
