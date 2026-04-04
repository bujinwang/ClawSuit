import Stripe from "stripe";

import type { PaymentProvider } from "./billing.js";

export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  public constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  public async createCustomer(input: { userId: string; phone?: string; email?: string }): Promise<{ id: string }> {
    const customer = await this.stripe.customers.create({
      metadata: { clawsuitUserId: input.userId },
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {})
    });
    return { id: customer.id };
  }

  public async createTrialSubscription(input: {
    customerId: string;
    priceId: string;
    trialDays: number;
  }): Promise<{ id: string; status: string; currentPeriodEnd: Date }> {
    const subscription = await this.stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: input.priceId }],
      trial_period_days: input.trialDays,
      payment_settings: { save_default_payment_method: "on_subscription" },
      trial_settings: {
        end_behavior: { missing_payment_method: "pause" }
      }
    });
    const billingPeriod = subscription as unknown as Stripe.Subscription & { current_period_end: number };

    return {
      id: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(billingPeriod.current_period_end * 1000)
    };
  }

  public async constructWebhookEvent(rawBody: Buffer, signature: string, webhookSecret: string): Promise<{
    type: string;
    subscription: { id: string; status: string; currentPeriodEnd: Date; trialEnd?: Date };
  }> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const subscription = event.data.object as Stripe.Subscription & { current_period_end: number };
    return {
      type: event.type,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        ...(subscription.trial_end ? { trialEnd: new Date(subscription.trial_end * 1000) } : {})
      }
    };
  }
}
