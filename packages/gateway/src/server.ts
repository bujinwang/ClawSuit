import { fileURLToPath } from "node:url";

import { Redis } from "ioredis";

import { validateGatewayEnv } from "@clawsuit/core";
import {
  BillingManager,
  RedisBillingRepository,
  CredentialService,
  OnboardingEngine,
  CompilerRoleActivator,
  RedisCredentialRepository,
  RedisSetupTokenStore,
  RedisUserStore,
  RedisOnboardingSessionStore
} from "@clawsuit/api";
import { ContainerProxy, HttpContainerTransport, RedisInstanceRegistry } from "@clawsuit/orchestrator";

import { createGatewayApp } from "./app.js";
import { MetaWhatsAppMediaResolver } from "./channels/whatsapp-media.js";
import { WhatsAppSender } from "./channels/whatsapp-send.js";
import { OpenAiLlmProvider, StubLlmProvider } from "./llm.js";
import { OpenAiWhisperTranscriber } from "./middleware/transcribe.js";
import { RateLimiter, RedisRateLimitStore } from "./rate-limit.js";
import { createGatewayIntentRouter } from "./skill-registry.js";
import { StripePaymentProvider } from "@clawsuit/api";

export async function buildGatewayServer(source: Record<string, string | undefined>) {
  const env = validateGatewayEnv(source);
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
  const whatsappSender = new WhatsAppSender({
    phoneNumberId: env.WA_PHONE_NUMBER_ID,
    accessToken: env.WA_ACCESS_TOKEN
  });
  const mediaResolver = new MetaWhatsAppMediaResolver({
    accessToken: env.WA_ACCESS_TOKEN
  });
  const onboardingEngine = new OnboardingEngine({
    sessionStore: new RedisOnboardingSessionStore(redis),
    userStore,
    messenger: {
      sendText: async (to, text) => whatsappSender.sendText(to, text),
      sendInteractive: async (to, body, buttons) => whatsappSender.sendInteractive(to, body, buttons)
    },
    activator: new CompilerRoleActivator({ repoRoot: process.cwd() }),
    ...(source.STRIPE_SECRET_KEY && source.STRIPE_WEBHOOK_SECRET && source.STRIPE_PRICE_REALTOR
      ? {
          billing: new BillingManager({
            provider: new StripePaymentProvider(source.STRIPE_SECRET_KEY),
            repository: new RedisBillingRepository(redis),
            userStore,
            messenger: {
              sendText: async (to, text) => whatsappSender.sendText(to, text),
              sendInteractive: async (to, body, buttons) => whatsappSender.sendInteractive(to, body, buttons)
            },
            containerPauser: {
              pause: async () => undefined
            },
            priceIds: { realtor: source.STRIPE_PRICE_REALTOR },
            webhookSecret: source.STRIPE_WEBHOOK_SECRET,
            billingUrl: `${env.APP_URL}/billing`
          })
        }
      : {}),
    repoRoot: process.cwd()
  });
  const intentRouter = createGatewayIntentRouter({
    repoRoot: process.cwd(),
    credentials,
    conversationProxy: new ContainerProxy({
      registry: new RedisInstanceRegistry(redis),
      transport: new HttpContainerTransport()
    }),
    whatsappSender,
    userStore,
    llmProvider: source.OPENAI_API_KEY
      ? new OpenAiLlmProvider({ apiKey: source.OPENAI_API_KEY })
      : new StubLlmProvider()
  });

  const app = createGatewayApp({
    userStore,
    onboardingEngine,
    verifyToken: env.WA_VERIFY_TOKEN,
    appSecret: env.WA_APP_SECRET,
    transcriber: new OpenAiWhisperTranscriber({
      ...(source.OPENAI_API_KEY ? { openAiApiKey: source.OPENAI_API_KEY } : {}),
      mediaResolver: mediaResolver.resolve.bind(mediaResolver),
    }),
    intentRouter,
    rateLimiter: new RateLimiter({
      store: new RedisRateLimitStore(redis),
      limit: 60,
      windowMs: 60 * 60 * 1000
    })
  });

  return { app, env };
}

async function startFromProcessEnv(): Promise<void> {
  const { app, env } = await buildGatewayServer(process.env);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startFromProcessEnv();
}
