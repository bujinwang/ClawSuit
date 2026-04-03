import { fileURLToPath } from "node:url";

import { validateGatewayEnv } from "@clawsuit/core";
import { InMemoryOnboardingSessionStore, InMemoryUserStore, OnboardingEngine, CompilerRoleActivator } from "@clawsuit/api";

import { createGatewayApp } from "./app.js";
import { StubTranscriber } from "./middleware/transcribe.js";
import { InMemoryRateLimitStore, RateLimiter } from "./rate-limit.js";

export async function buildGatewayServer(source: Record<string, string | undefined>) {
  const env = validateGatewayEnv(source);
  const userStore = new InMemoryUserStore();
  const onboardingEngine = new OnboardingEngine({
    sessionStore: new InMemoryOnboardingSessionStore(),
    userStore,
    messenger: {
      sendText: async () => undefined,
      sendInteractive: async () => undefined
    },
    activator: new CompilerRoleActivator(),
    repoRoot: process.cwd()
  });

  const app = createGatewayApp({
    userStore,
    onboardingEngine,
    verifyToken: env.WA_VERIFY_TOKEN,
    appSecret: env.WA_APP_SECRET,
    transcriber: new StubTranscriber(""),
    intentRouter: {
      route: async () => undefined
    },
    rateLimiter: new RateLimiter({
      store: new InMemoryRateLimitStore(),
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
