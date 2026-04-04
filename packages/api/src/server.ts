import { Redis } from "ioredis";

import { BullMqWorkflowQueue, validateApiEnv } from "@clawsuit/core";
import { ContainerManager, DockerContainerRuntime, RedisInstanceRegistry } from "@clawsuit/orchestrator";

import { createApiApp } from "./app.js";
import { BillingManager, RedisBillingRepository } from "./billing.js";
import { CredentialService, RedisCredentialRepository, RedisSetupTokenStore } from "./credentials.js";
import { OnboardingEngine } from "./onboarding/engine.js";
import { CompilerRoleActivator } from "./onboarding/role-activator.js";
import { RedisOnboardingSessionStore } from "./storage/onboarding-session-store.js";
import { RedisUserStore } from "./storage/user-store.js";
import { StripePaymentProvider } from "./stripe-provider.js";
import { fileURLToPath } from "node:url";

export async function buildApiServer(source: Record<string, string | undefined>): Promise<{
  app: ReturnType<typeof createApiApp>;
  env: ReturnType<typeof validateApiEnv>;
}> {
  const env = validateApiEnv(source);
  const redis = new Redis(env.REDIS_URL);
  const redisCredentialClient = {
    set: async (key: string, value: string, ...args: Array<string | number>) => {
      if (args[0] === "EX" && typeof args[1] === "number") {
        return redis.set(key, value, "EX", args[1]);
      }
      return redis.set(key, value);
    },
    get: async (key: string) => redis.get(key),
    del: async (...keys: string[]) => redis.del(...keys)
  };
  const userStore = new RedisUserStore(redis);
  const credentials = new CredentialService({
    encryptionKeyHex: env.CREDENTIAL_ENCRYPTION_KEY,
    repository: new RedisCredentialRepository(redisCredentialClient),
    setupTokens: new RedisSetupTokenStore(redisCredentialClient),
    appUrl: env.APP_URL
  });
  const workflowQueue = new BullMqWorkflowQueue(env.REDIS_URL);
  const containerRegistry = new RedisInstanceRegistry(redis);
  const containerManager = new ContainerManager({
    runtime: new DockerContainerRuntime(),
    registry: containerRegistry,
    baseConfigDir: env.OPENCLAW_DATA_DIR,
    ...(source.ANTHROPIC_API_KEY ? { anthropicApiKey: source.ANTHROPIC_API_KEY } : {})
  });
  const billing = new BillingManager({
    provider: new StripePaymentProvider(env.STRIPE_SECRET_KEY),
    repository: new RedisBillingRepository(redis),
    userStore,
    messenger: {
      sendText: async () => undefined,
      sendInteractive: async () => undefined
    },
    containerPauser: containerManager,
    priceIds: { realtor: env.STRIPE_PRICE_REALTOR },
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    billingUrl: `${env.APP_URL}/billing`
  });
  const onboardingEngine = new OnboardingEngine({
    sessionStore: new RedisOnboardingSessionStore(redis),
    userStore,
    messenger: {
      sendText: async () => undefined,
      sendInteractive: async () => undefined
    },
    activator: new CompilerRoleActivator({
      repoRoot: process.cwd(),
      workflowQueue
    }),
    billing,
    repoRoot: process.cwd()
  });
  const app = createApiApp({
    appUrl: env.APP_URL,
    encryptionKeyHex: env.CREDENTIAL_ENCRYPTION_KEY,
    credentialService: credentials,
    onboardingEngine
  });

  return { app, env };
}

async function startFromProcessEnv(): Promise<void> {
  const { app, env } = await buildApiServer(process.env);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startFromProcessEnv();
}
