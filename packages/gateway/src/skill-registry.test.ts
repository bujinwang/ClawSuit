import path from "node:path";
import { describe, expect, it } from "vitest";

import { CredentialService, InMemoryCredentialRepository, InMemorySetupTokenStore, InMemoryUserStore } from "@clawsuit/api";

import { createGatewayIntentRouter } from "./skill-registry.js";
import { StubLlmProvider } from "./llm.js";

describe("createGatewayIntentRouter", () => {
  it("routes a workflow and sends the whatsapp reply through the concrete skill registry", async () => {
    const repository = new InMemoryCredentialRepository();
    const credentials = new CredentialService({
      encryptionKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      repository,
      setupTokens: new InMemorySetupTokenStore(),
      appUrl: "https://clawsuit.io"
    });
    const userStore = new InMemoryUserStore();
    const user = await userStore.create("+17805550123");
    await userStore.save({ ...user, activeRole: "realtor" });

    const sent: Array<{ to: string; text: string }> = [];
    const router = createGatewayIntentRouter({
      repoRoot: path.resolve(process.cwd(), "../.."),
      credentials,
      conversationProxy: {
        sendMessage: async () => "fallback"
      },
      llmProvider: new StubLlmProvider(),
      whatsappSender: {
        sendText: async (to: string, text: string) => {
          sent.push({ to, text });
        },
        sendTemplate: async () => undefined,
        sendInteractive: async () => undefined
      } as never,
      userStore
    });

    await router.executeWorkflowById("client-followup", {
      user: { id: user.id, phone: user.phone },
      role: {
        roleSlug: "realtor",
        config: {
          name_brokerage: "Alex Morgan, Northbank Realty",
          tone: "Professional and direct"
        }
      },
      text: "follow up with my client",
      channel: "whatsapp"
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(user.phone);
  });
});
