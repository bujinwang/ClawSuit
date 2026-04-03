import crypto from "node:crypto";
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
} from "@clawsuit/api";

import { createGatewayApp } from "./app.js";
import { StubTranscriber } from "./middleware/transcribe.js";
import type { IntentRouter } from "./types.js";

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

class CapturingRouter implements IntentRouter {
  public readonly events: Array<{ userId: string; roleSlug: string; text: string; channel: string }> = [];

  public async route(input: { userId: string; roleSlug: string; text: string; channel: string }): Promise<void> {
    this.events.push(input);
  }
}

describe("createGatewayApp", () => {
  it("verifies the WhatsApp webhook challenge", async () => {
    const app = createGatewayApp(buildDeps());

    const response = await app.inject({
      method: "GET",
      url: "/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("12345");
  });

  it("starts onboarding for a new WhatsApp user and acknowledges the webhook", async () => {
    const deps = buildDeps();
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "wa_phone_id" },
                messages: [
                  {
                    from: "+17805550123",
                    type: "text",
                    text: { body: "Hi" }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const app = createGatewayApp(deps);
    const signature = signPayload(payload, "app-secret");

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: {
        "x-hub-signature-256": signature
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    await waitFor(() => deps.messenger.texts.length > 0);
    expect(deps.messenger.texts[0]?.text).toContain("1 of 5");
  });
});

function buildDeps() {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const messenger = new CapturingMessenger();
  const userStore = new InMemoryUserStore();
  const router = new CapturingRouter();
  void mkdtemp(path.join(tmpdir(), "clawsuit-gateway-"));

  const onboardingEngine = new OnboardingEngine({
    sessionStore: new InMemoryOnboardingSessionStore(),
    userStore,
    messenger,
    activator: new CompilerRoleActivator({ repoRoot, outputRoot: path.join(tmpdir(), "clawsuit-gateway-compiled") }),
    repoRoot
  });

  return {
    userStore,
    onboardingEngine,
    verifyToken: "verify-me",
    appSecret: "app-secret",
    transcriber: new StubTranscriber("voice transcript"),
    intentRouter: router,
    messenger
  };
}

function signPayload(payload: unknown, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")}`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for async webhook processing");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
