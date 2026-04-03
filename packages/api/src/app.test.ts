import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { OnboardingEngine } from "./onboarding/engine.js";
import { CompilerRoleActivator } from "./onboarding/role-activator.js";
import { createApiApp } from "./app.js";
import { InMemoryOnboardingSessionStore } from "./storage/onboarding-session-store.js";
import { InMemoryUserStore } from "./storage/user-store.js";
import type { PromptButton, PromptChannel } from "./types.js";

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

describe("createApiApp", () => {
  it("progresses onboarding through all five realtor questions", async () => {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const outputRoot = await mkdtemp(path.join(tmpdir(), "clawsuit-api-"));
    const messenger = new CapturingMessenger();
    const userStore = new InMemoryUserStore();
    const user = await userStore.create("+17805550123");

    const engine = new OnboardingEngine({
      sessionStore: new InMemoryOnboardingSessionStore(),
      userStore,
      messenger,
      activator: new CompilerRoleActivator({ repoRoot, outputRoot }),
      repoRoot
    });

    const app = createApiApp({ messenger, onboardingEngine: engine, repoRoot });

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/v1/onboarding/start",
      payload: {
        userId: user.id,
        roleSlug: "realtor",
        channel: "whatsapp"
      }
    });

    expect(startResponse.statusCode).toBe(201);
    const startPayload = startResponse.json() as { sessionId: string };
    expect(messenger.texts[0]?.text).toContain("1 of 5");

    const answers = [
      "Alex Morgan, Northbank Realty",
      "Edmonton, St. Albert",
      "8:00 AM",
      "Professional and direct",
      "alex@example.com"
    ];

    for (const answer of answers) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/onboarding/${startPayload.sessionId}/answer`,
        payload: {
          userId: user.id,
          answer
        }
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 500) {
        throw new Error(response.body);
      }
    }

    const activatedUser = await userStore.findById(user.id);
    expect(activatedUser?.activeRole).toBe("realtor");
    expect(messenger.interactives.at(-1)?.body).toContain("You're live, Alex");
  });
});
