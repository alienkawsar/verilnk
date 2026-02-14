# Payments Switchover Guide

This project currently uses a mock billing flow. The codebase is prepared for Stripe and SSLCommerz providers, but no live calls are enabled.

## Current Billing Design
- Core models: `BillingAccount`, `Subscription`, `Invoice`, `PaymentAttempt`, `TrialSession`.
- Entitlements: `backend/src/services/entitlement.service.ts`.
- Mock flow routes:
  - `POST /api/billing/mock/checkout`
  - `POST /api/billing/mock/callback`
  - `POST /api/billing/trial/start`
  - `GET /api/billing/trial/status`
  - Admin billing endpoints in `backend/src/routes/billing.admin.routes.ts`

## Payment Providers (Adapter Layer)
- Interface: `backend/src/services/payment-providers/provider.interface.ts`
  - `createCheckout()`
  - `verifyPayment()`
  - `refund()`
  - `getStatus()`
- Implementations:
  - `backend/src/services/payment-providers/mock.provider.ts`
  - `backend/src/services/payment-providers/stripe.provider.ts` (stub)
  - `backend/src/services/payment-providers/sslcommerz.provider.ts` (stub)
- Provider selector:
  - `backend/src/services/payment-providers/index.ts`

## Stripe Integration (when keys are available)
Required env vars:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Flow:
1) `createCheckout()` creates a Stripe Checkout Session.
2) Redirect user to Stripe Checkout.
3) Webhook receives `checkout.session.completed` or `invoice.payment_succeeded`.
4) Verify webhook signature.
5) Map event to:
   - `Invoice` (paid/failed)
   - `Subscription` (active/canceled)
6) Apply plan entitlements on success.

Important:
- Enforce idempotency for webhook events.
- Store Stripe `event.id` and `payment_intent` IDs on `PaymentAttempt`.
- Validate amounts and currency before activating plans.

## SSLCommerz Integration (when creds are available)
Required env vars:
- `SSLCOMMERZ_STORE_ID`
- `SSLCOMMERZ_STORE_PASSWORD`
- `SSLCOMMERZ_SANDBOX` (true/false)

Flow:
1) `createCheckout()` initiates SSLCommerz payment session.
2) SSLCommerz returns `val_id` on success.
3) Verify with validation API/IPN.
4) Map status to `Invoice` and `Subscription`.

Important:
- Validate transaction amounts and merchant IDs.
- Store `val_id` for auditability.

## Disable Mock in Production
- Set `PAYMENT_MODE=live`
- Ensure provider selection in `payment-providers/index.ts` points to real provider
- Keep mock only for dev/staging environments

## Post‑Switch Checklist
- Verify webhook signature and idempotency.
- Confirm invoice creation and subscription activation.
- Test refunds and cancellation behavior.
- Confirm entitlements update and downgrade on failure.
- Validate admin logs on billing actions.
