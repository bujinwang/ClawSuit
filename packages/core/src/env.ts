export interface BaseRuntimeEnv {
  NODE_ENV: "development" | "test" | "production";
  APP_URL: string;
}

export interface ApiRuntimeEnv extends BaseRuntimeEnv {
  PORT: number;
  CREDENTIAL_ENCRYPTION_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_REALTOR: string;
  OPENCLAW_DATA_DIR: string;
}

export interface GatewayRuntimeEnv extends BaseRuntimeEnv {
  PORT: number;
  WA_VERIFY_TOKEN: string;
  WA_APP_SECRET: string;
  WA_PHONE_NUMBER_ID: string;
  WA_ACCESS_TOKEN: string;
}

export function validateApiEnv(source: Record<string, string | undefined>): ApiRuntimeEnv {
  const env: ApiRuntimeEnv = {
    NODE_ENV: parseNodeEnv(source.NODE_ENV),
    PORT: parsePort(source.PORT ?? "4000"),
    APP_URL: requireValue(source.APP_URL, "APP_URL"),
    CREDENTIAL_ENCRYPTION_KEY: requireHexKey(source.CREDENTIAL_ENCRYPTION_KEY, "CREDENTIAL_ENCRYPTION_KEY"),
    STRIPE_WEBHOOK_SECRET: requireValue(source.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET"),
    STRIPE_PRICE_REALTOR: requireValue(source.STRIPE_PRICE_REALTOR, "STRIPE_PRICE_REALTOR"),
    OPENCLAW_DATA_DIR: requireValue(source.OPENCLAW_DATA_DIR, "OPENCLAW_DATA_DIR")
  };

  return env;
}

export function validateGatewayEnv(source: Record<string, string | undefined>): GatewayRuntimeEnv {
  return {
    NODE_ENV: parseNodeEnv(source.NODE_ENV),
    PORT: parsePort(source.PORT ?? "4001"),
    APP_URL: requireValue(source.APP_URL, "APP_URL"),
    WA_VERIFY_TOKEN: requireValue(source.WA_VERIFY_TOKEN, "WA_VERIFY_TOKEN"),
    WA_APP_SECRET: requireValue(source.WA_APP_SECRET, "WA_APP_SECRET"),
    WA_PHONE_NUMBER_ID: requireValue(source.WA_PHONE_NUMBER_ID, "WA_PHONE_NUMBER_ID"),
    WA_ACCESS_TOKEN: requireValue(source.WA_ACCESS_TOKEN, "WA_ACCESS_TOKEN")
  };
}

function parseNodeEnv(value: string | undefined): BaseRuntimeEnv["NODE_ENV"] {
  const normalized = value ?? "development";
  if (normalized === "development" || normalized === "test" || normalized === "production") {
    return normalized;
  }
  throw new Error(`NODE_ENV must be development, test, or production. Received: ${normalized}`);
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer. Received: ${value}`);
  }
  return port;
}

function requireValue(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function requireHexKey(value: string | undefined, key: string): string {
  const normalized = requireValue(value, key);
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error(`${key} must be 64 hex chars`);
  }
  return normalized;
}
