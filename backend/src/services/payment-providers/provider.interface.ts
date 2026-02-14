export interface PaymentProvider {
    createCheckout(payload: Record<string, any>): Promise<Record<string, any>>;
    verifyPayment(payload: Record<string, any>): Promise<Record<string, any>>;
    refund(payload: Record<string, any>): Promise<Record<string, any>>;
    getStatus(payload: Record<string, any>): Promise<Record<string, any>>;
}
