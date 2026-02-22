export type PaymentProvider = 'stripe' | 'sslcommerz';

const PAYMENT_PROVIDER_VALUES: readonly PaymentProvider[] = [
  'stripe',
  'sslcommerz',
] as const;

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}

const hasValue = (value: string | undefined) =>
  Boolean(value && value.trim().length > 0);

export const getSslcommerzSandboxMode = (): boolean => {
  const value = process.env.SSLCOMMERZ_IS_SANDBOX;
  if (!value) return false;
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
};

const isValidBooleanToken = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === 'false' ||
    normalized === '1' ||
    normalized === '0' ||
    normalized === 'yes' ||
    normalized === 'no'
  );
};

const resolvePaymentProvider = (): PaymentProvider => {
  const rawProvider = String(process.env.PAYMENT_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (!PAYMENT_PROVIDER_VALUES.includes(rawProvider as PaymentProvider)) {
    throw new PaymentConfigurationError(
      'PAYMENT_PROVIDER must be set to "stripe" or "sslcommerz".',
    );
  }
  return rawProvider as PaymentProvider;
};

const requireEnvironmentVariables = (
  provider: PaymentProvider,
  envNames: string[],
) => {
  const missing = envNames.filter((name) => !hasValue(process.env[name]));
  if (missing.length > 0) {
    throw new PaymentConfigurationError(
      `Missing required environment variables for PAYMENT_PROVIDER=${provider}: ${missing.join(', ')}`,
    );
  }
};

let cachedProvider: PaymentProvider | null = null;

export const validatePaymentConfiguration = (): PaymentProvider => {
  const isProduction = process.env.NODE_ENV === 'production';
  const provider = resolvePaymentProvider();

  requireEnvironmentVariables(provider, ['APP_URL']);

  if (provider === 'stripe') {
    requireEnvironmentVariables(provider, ['STRIPE_SECRET_KEY']);
    if (isProduction) {
      requireEnvironmentVariables(provider, ['STRIPE_WEBHOOK_SECRET']);
    }
  }

  if (provider === 'sslcommerz') {
    requireEnvironmentVariables(provider, [
      'SSLCOMMERZ_STORE_ID',
      'SSLCOMMERZ_STORE_PASSWORD',
    ]);
    const sandboxValue = process.env.SSLCOMMERZ_IS_SANDBOX;
    if (
      hasValue(sandboxValue) &&
      !isValidBooleanToken(sandboxValue as string)
    ) {
      throw new PaymentConfigurationError(
        'SSLCOMMERZ_IS_SANDBOX must be a boolean token: true/false/1/0/yes/no.',
      );
    }
  }

  return provider;
};

export const getConfiguredPaymentProvider = (): PaymentProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  cachedProvider = validatePaymentConfiguration();
  return cachedProvider;
};
