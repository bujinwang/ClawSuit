import { describe, expect, it } from "vitest";

import { BillingManager, InMemoryBillingRepository, type ContainerPauser, type PaymentProvider } from "./billing.js";
import { InMemoryUserStore } from "./storage/user-store.js";
import type { PromptButton, PromptChannel } from "./types.js";

class FakeMessenger implements PromptChannel {
  public readonly texts: Array<{ to: string; text: string }> = [];

  public async sendText(to: string, text: string): Promise<void> {
    this.texts.push({ to, text });
  }

  public async sendInteractive(_to: string, _body: string, _buttons: PromptButton[]): Promise<void> {
    return undefined;
  }
}

class FakePaymentProvider implements PaymentProvider {
  public async createCustomer(): Promise<{ id: string }> {
    return { id: "cus_123" };
  }

  public async createTrialSubscription(): Promise<{ id: string; status: string; currentPeriodEnd: Date }> {
    return { id: "sub_123", status: "trialing", currentPeriodEnd: new Date("2026-04-17T00:00:00Z") };
  }

  public async constructWebhookEvent(): Promise<{
    type: string;
    subscription: { id: string; status: string; currentPeriodEnd: Date; trialEnd?: Date };
  }> {
    return {
      type: "customer.subscription.trial_will_end",
      subscription: {
        id: "sub_123",
        status: "trialing",
        currentPeriodEnd: new Date("2026-04-17T00:00:00Z"),
        trialEnd: new Date("2026-04-17T00:00:00Z")
      }
    };
  }
}

class FakePauser implements ContainerPauser {
  public pausedUserIds: string[] = [];

  public async pause(userId: string): Promise<void> {
    this.pausedUserIds.push(userId);
  }
}

describe("BillingManager", () => {
  it("starts a trial and stores subscription state", async () => {
    const users = new InMemoryUserStore();
    const user = await users.create("+17805550123");
    const manager = new BillingManager({
      provider: new FakePaymentProvider(),
      repository: new InMemoryBillingRepository(),
      userStore: users,
      messenger: new FakeMessenger(),
      containerPauser: new FakePauser(),
      priceIds: { realtor: "price_realtor" },
      webhookSecret: "whsec",
      billingUrl: "https://clawsuit.io/billing"
    });

    await manager.startTrial(user.id, "realtor");
    const updated = await users.findById(user.id);
    expect(updated?.stripeCustomerId).toBe("cus_123");
    expect(updated?.trialEndsAt).toBeInstanceOf(Date);
  });

  it("sends a trial ending reminder from the webhook", async () => {
    const users = new InMemoryUserStore();
    const user = await users.create("+17805550123");
    const repository = new InMemoryBillingRepository();
    const messenger = new FakeMessenger();
    const manager = new BillingManager({
      provider: new FakePaymentProvider(),
      repository,
      userStore: users,
      messenger,
      containerPauser: new FakePauser(),
      priceIds: { realtor: "price_realtor" },
      webhookSecret: "whsec",
      billingUrl: "https://clawsuit.io/billing"
    });

    await repository.save({
      userId: user.id,
      stripeSubId: "sub_123",
      stripePriceId: "price_realtor",
      status: "trialing",
      currentPeriodEnd: new Date("2026-04-17T00:00:00Z")
    });

    await manager.handleStripeWebhook(Buffer.from("{}"), "sig");
    expect(messenger.texts[0]?.text).toContain("trial ends on");
  });
});
