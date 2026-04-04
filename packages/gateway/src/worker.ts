import { fileURLToPath } from "node:url";

import { Worker } from "bullmq";
import { Redis } from "ioredis";

import { CredentialService, RedisCredentialRepository, RedisSetupTokenStore, RedisUserStore } from "@clawsuit/api";
import type { RouterInput } from "@clawsuit/core";
import { ContainerProxy, HttpContainerTransport, RedisInstanceRegistry } from "@clawsuit/orchestrator";

import { WhatsAppSender } from "./channels/whatsapp-send.js";
import { OpenAiLlmProvider, StubLlmProvider } from "./llm.js";
import { createGatewayIntentRouter } from "./skill-registry.js";

export interface WorkflowJobData {
  userId: string;
  workflowId: string;
  roleSlug: string;
}

export function createWorkflowJobProcessor(deps: {
  userStore: { findById(id: string): Promise<{ id: string; phone: string; activeRole?: string; activeRoleConfig?: Record<string, string> } | undefined> };
  router: { executeWorkflowById(workflowId: string, input: Omit<RouterInput, "text"> & { text?: string }): Promise<void> };
}) {
  return async (job: { data: WorkflowJobData }): Promise<void> => {
    const user = await deps.userStore.findById(job.data.userId);
    if (!user?.activeRole) {
      throw new Error(`No active role for user ${job.data.userId}`);
    }

    await deps.router.executeWorkflowById(job.data.workflowId, {
      user: { id: user.id, phone: user.phone },
      role: { roleSlug: job.data.roleSlug, config: user.activeRoleConfig ?? {} },
      channel: "whatsapp"
    });
  };
}

export async function buildGatewayWorker(source: Record<string, string | undefined>) {
  const redisUrl = source.REDIS_URL ?? "redis://localhost:6379";
  const redis = new Redis(redisUrl);
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
    encryptionKeyHex: source.CREDENTIAL_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    repository: new RedisCredentialRepository(redisCredentialClient),
    setupTokens: new RedisSetupTokenStore(redisCredentialClient),
    appUrl: source.APP_URL ?? "https://clawsuit.io"
  });
  const whatsappSender = new WhatsAppSender({
    phoneNumberId: source.WA_PHONE_NUMBER_ID ?? "",
    accessToken: source.WA_ACCESS_TOKEN ?? ""
  });
  const router = createGatewayIntentRouter({
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

  const worker = new Worker<WorkflowJobData>(
    "workflows",
    createWorkflowJobProcessor({ userStore, router }),
    { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) }
  );

  return { worker };
}

async function startFromProcessEnv(): Promise<void> {
  const { worker } = await buildGatewayWorker(process.env);
  await worker.waitUntilReady();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startFromProcessEnv();
}
