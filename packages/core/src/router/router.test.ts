import path from "node:path";

import { describe, expect, it } from "vitest";

import { IntentRouter, type ChannelResponder, type ConversationProxy, type SkillExecutor, type SkillRegistry } from "./index.js";

class FakeSkillRegistry implements SkillRegistry {
  public readonly calls: Array<{ skillId: string; userId: string; input: unknown }> = [];

  public async load(skillId: string, userId: string): Promise<SkillExecutor> {
    return {
      execute: async (input: unknown) => {
        this.calls.push({ skillId, userId, input });
        if (skillId === "llm-extract") {
          return { datetime: "2026-04-04T13:00:00", address: "123 Main St", clientEmail: "buyer@example.com" };
        }
        return { ok: true };
      }
    };
  }
}

class FakeProxy implements ConversationProxy {
  public async sendMessage(): Promise<string> {
    return "freeform reply";
  }
}

class FakeResponder implements ChannelResponder {
  public readonly replies: Array<{ channel: string; phone: string; text: string }> = [];

  public async send(channel: "whatsapp" | "telegram" | "slack", phone: string, text: string): Promise<void> {
    this.replies.push({ channel, phone, text });
  }
}

describe("IntentRouter", () => {
  it("executes a matched workflow with resolved templates", async () => {
    const skills = new FakeSkillRegistry();
    const router = new IntentRouter({
      skillRegistry: skills,
      conversationProxy: new FakeProxy(),
      responder: new FakeResponder(),
      repoRoot: path.resolve(process.cwd(), "../..")
    });

    await router.route({
      user: { id: "user_1", phone: "+17805550123" },
      role: {
        roleSlug: "realtor",
        config: {
          name_brokerage: "Alex Morgan, Northbank Realty",
          tone: "Professional and direct"
        }
      },
      text: "Please schedule a showing for tomorrow",
      channel: "whatsapp"
    });

    expect(skills.calls[0]?.skillId).toBe("llm-extract");
    expect(skills.calls.at(-1)?.skillId).toBe("whatsapp-reply");
  });

  it("falls back to the container proxy when no workflow matches", async () => {
    const responder = new FakeResponder();
    const router = new IntentRouter({
      skillRegistry: new FakeSkillRegistry(),
      conversationProxy: new FakeProxy(),
      responder,
      repoRoot: path.resolve(process.cwd(), "../..")
    });

    await router.route({
      user: { id: "user_1", phone: "+17805550123" },
      role: { roleSlug: "realtor", config: {} },
      text: "What should I do today?",
      channel: "whatsapp"
    });

    expect(responder.replies[0]?.text).toBe("freeform reply");
  });
});
