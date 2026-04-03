import type { UserStore } from "./storage/user-store.js";
import type { BillingService, PromptChannel, UserRecord } from "./types.js";

export interface BillingSubscriptionRecord {
  userId: string;
  stripeSubId: string;
  stripePriceId: string;
  status: string;
  currentPeriodEnd: Date;
}

export interface BillingRepository {
  save(record: BillingSubscriptionRecord): Promise<void>;
  findByStripeSubId(stripeSubId: string): Promise<BillingSubscriptionRecord | undefined>;
}

export interface PaymentProvider {
  createCustomer(input: { userId: string; phone?: string; email?: string }): Promise<{ id: string }>;
  createTrialSubscription(input: { customerId: string; priceId: string; trialDays: number }): Promise<{
    id: string;
    status: string;
    currentPeriodEnd: Date;
  }>;
  constructWebhookEvent(rawBody: Buffer, signature: string, webhookSecret: string): Promise<{
    type: string;
    subscription: {
      id: string;
      status: string;
      currentPeriodEnd: Date;
      trialEnd?: Date;
    };
  }>;
}

export interface ContainerPauser {
  pause(userId: string): Promise<void>;
}

export class InMemoryBillingRepository implements BillingRepository {
  private readonly bySubId = new Map<string, BillingSubscriptionRecord>();

  public async save(record: BillingSubscriptionRecord): Promise<void> {
    this.bySubId.set(record.stripeSubId, record);
  }

  public async findByStripeSubId(stripeSubId: string): Promise<BillingSubscriptionRecord | undefined> {
    return this.bySubId.get(stripeSubId);
  }
}

export class BillingManager implements BillingService {
  public constructor(
    private readonly deps: {
      provider: PaymentProvider;
      repository: BillingRepository;
      userStore: UserStore;
      messenger: PromptChannel;
      containerPauser: ContainerPauser;
      priceIds: Record<string, string>;
      webhookSecret: string;
      billingUrl: string;
    }
  ) {}

  public async startTrial(userId: string, roleSlug: string): Promise<void> {
    const user = await this.requireUser(userId);
    const priceId = this.deps.priceIds[roleSlug];
    if (!priceId) {
      throw new Error(`No Stripe price configured for role ${roleSlug}`);
    }

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.deps.provider.createCustomer({
        userId,
        ...(user.phone ? { phone: user.phone } : {}),
        ...(user.email ? { email: user.email } : {})
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
    }

    const subscription = await this.deps.provider.createTrialSubscription({
      customerId: stripeCustomerId,
      priceId,
      trialDays: 14
    });

    user.trialEndsAt = new Date(Date.now() + 14 * 86400000);
    await this.deps.userStore.save(user);
    await this.deps.repository.save({
      userId,
      stripeSubId: subscription.id,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  }

  public async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = await this.deps.provider.constructWebhookEvent(rawBody, signature, this.deps.webhookSecret);
    const billing = await this.deps.repository.findByStripeSubId(event.subscription.id);
    if (!billing) {
      return;
    }

    await this.deps.repository.save({
      ...billing,
      status: event.subscription.status,
      currentPeriodEnd: event.subscription.currentPeriodEnd
    });

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      if (event.subscription.status === "paused" || event.subscription.status === "canceled") {
        await this.deps.containerPauser.pause(billing.userId);
      }
      return;
    }

    if (event.type === "customer.subscription.trial_will_end") {
      const user = await this.requireUser(billing.userId);
      const trialEnd = event.subscription.trialEnd?.toLocaleDateString("en-CA");
      await this.deps.messenger.sendText(
        user.phone,
        `Your ClawSuit trial ends on ${trialEnd}. Add a payment method to continue: ${this.deps.billingUrl}`
      );
    }
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.deps.userStore.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return user;
  }
}
