import Fastify, { type FastifyInstance } from "fastify";

import { BillingManager, InMemoryBillingRepository } from "./billing.js";
import { CredentialService, InMemoryCredentialRepository, InMemorySetupTokenStore } from "./credentials.js";
import { OnboardingEngine } from "./onboarding/engine.js";
import { CompilerRoleActivator } from "./onboarding/role-activator.js";
import { registerCredentialRoutes } from "./routes/credentials.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { InMemoryOnboardingSessionStore } from "./storage/onboarding-session-store.js";
import { InMemoryUserStore } from "./storage/user-store.js";
import type { PaymentProvider, ContainerPauser } from "./billing.js";
import type { PromptChannel } from "./types.js";

export function createApiApp(options: {
  messenger?: PromptChannel;
  onboardingEngine?: OnboardingEngine;
  repoRoot?: string;
  encryptionKeyHex?: string;
  appUrl?: string;
  paymentProvider?: PaymentProvider;
  containerPauser?: ContainerPauser;
  priceIds?: Record<string, string>;
} = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  const userStore = new InMemoryUserStore();
  const messenger = options.messenger ?? {
    sendText: async () => undefined,
    sendInteractive: async () => undefined
  };
  const credentials = new CredentialService({
    encryptionKeyHex: options.encryptionKeyHex ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    repository: new InMemoryCredentialRepository(),
    setupTokens: new InMemorySetupTokenStore(),
    appUrl: options.appUrl ?? "https://clawsuit.io"
  });
  const billing = options.paymentProvider
    ? new BillingManager({
        provider: options.paymentProvider,
        repository: new InMemoryBillingRepository(),
        userStore,
        messenger,
        containerPauser: options.containerPauser ?? { pause: async () => undefined },
        priceIds: options.priceIds ?? { realtor: "price_realtor" },
        webhookSecret: "whsec_test",
        billingUrl: `${options.appUrl ?? "https://clawsuit.io"}/billing`
      })
    : undefined;
  const engine = options.onboardingEngine ?? new OnboardingEngine({
    sessionStore: new InMemoryOnboardingSessionStore(),
    userStore,
    messenger,
    activator: new CompilerRoleActivator(options.repoRoot ? { repoRoot: options.repoRoot } : {}),
    ...(billing ? { billing } : {}),
    ...(options.repoRoot ? { repoRoot: options.repoRoot } : {})
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, route: request.routeOptions.url }, "api request failed");
    reply.status(500).send({ error: error instanceof Error ? error.message : "Internal Server Error" });
  });

  app.get("/health", async () => ({ ok: true }));
  registerOnboardingRoutes(app, engine);
  registerCredentialRoutes(app, credentials);

  return app;
}
