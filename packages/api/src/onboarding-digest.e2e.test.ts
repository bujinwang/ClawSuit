import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  CompilerRoleActivator,
  InMemoryOnboardingSessionStore,
  InMemoryUserStore,
  OnboardingEngine,
  type PromptButton,
  type PromptChannel
} from "./index.js";
import {
  IntentRouter,
  type ChannelResponder,
  type ConversationProxy,
  type SkillExecutor,
  type SkillRegistry,
  type WorkflowQueue
} from "@clawsuit/core";

class CapturingMessenger implements PromptChannel {
  public readonly texts: Array<{ to: string; text: string }> = [];
  public readonly interactives: Array<{ to: string; body: string; buttons: PromptButton[] }> = [];

  public async sendText(to: string, text: string): Promise<void> {
    this.texts.push({ to, text });
  }

  public async sendInteractive(to: string, body: string, buttons: PromptButton[]): Promise<void> {
    this.interactives.push({ to, body, buttons });
  }
}

class CapturingWorkflowQueue implements WorkflowQueue {
  public readonly jobs: Array<{ workflowId: string; roleSlug: string; userId: string }> = [];

  public async add(
    _name: string,
    data: { userId: string; workflowId: string; roleSlug: string }
  ): Promise<void> {
    this.jobs.push(data);
  }
}

class DigestSkillRegistry implements SkillRegistry {
  public readonly sends: Array<Record<string, unknown>> = [];

  public async load(skillId: string): Promise<SkillExecutor> {
    return {
      execute: async (input: unknown) => {
        if (skillId === "mls-search") {
          return [{ address: "123 Main St", price: 550000 }];
        }
        if (skillId === "google-calendar") {
          return [{ title: "Listing appointment", start: "2026-04-04T16:00:00Z" }];
        }
        if (skillId === "llm-format") {
          return { summary: "1 new listing", todaySchedule: "1 appointment" };
        }
        if (skillId === "whatsapp-send") {
          this.sends.push(input as Record<string, unknown>);
          return { delivered: true };
        }
        return {};
      }
    };
  }
}

class NoopProxy implements ConversationProxy {
  public async sendMessage(): Promise<string> {
    return "unused";
  }
}

class NoopResponder implements ChannelResponder {
  public async send(): Promise<void> {
    return undefined;
  }
}

describe("onboarding to morning digest", () => {
  it("completes onboarding, schedules the digest workflow, and executes the send step", async () => {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const outputRoot = await mkdtemp(path.join(tmpdir(), "clawsuit-e2e-"));
    const messenger = new CapturingMessenger();
    const userStore = new InMemoryUserStore();
    const user = await userStore.create("+17805550123");
    const workflowQueue = new CapturingWorkflowQueue();

    const onboarding = new OnboardingEngine({
      sessionStore: new InMemoryOnboardingSessionStore(),
      userStore,
      messenger,
      activator: new CompilerRoleActivator({ repoRoot, outputRoot, workflowQueue }),
      billing: {
        startTrial: async () => undefined
      },
      repoRoot
    });

    const session = await onboarding.start(user.id, "realtor", "whatsapp");
    const answers = [
      "Alex Morgan, Northbank Realty",
      "Edmonton, St. Albert",
      "8:00 AM",
      "Professional and direct",
      "alex@example.com"
    ];

    for (const answer of answers) {
      await onboarding.handleAnswer(user.id, session.id, answer);
    }

    expect(workflowQueue.jobs).toHaveLength(1);
    expect(workflowQueue.jobs[0]?.workflowId).toBe("morning-digest");

    const routerSkills = new DigestSkillRegistry();
    const router = new IntentRouter({
      skillRegistry: routerSkills,
      conversationProxy: new NoopProxy(),
      responder: new NoopResponder(),
      repoRoot
    });

    await router.executeWorkflowById("morning-digest", {
      user: { id: user.id, phone: user.phone },
      role: {
        roleSlug: "realtor",
        config: {
          name_brokerage: "Alex Morgan, Northbank Realty",
          markets: "Edmonton, St. Albert",
          digest_time: "8:00 AM",
          tone: "Professional and direct",
          email: "alex@example.com"
        }
      },
      channel: "whatsapp"
    });

    expect(routerSkills.sends).toHaveLength(1);
    expect(routerSkills.sends[0]?.to).toBe(user.phone);
    expect(messenger.interactives.at(-1)?.body).toContain("You're live, Alex");
  });
});
