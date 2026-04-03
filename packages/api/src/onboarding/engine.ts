import type { RoleBundle } from "@clawsuit/marketplace";

import { loadRoleBundle } from "../roles/load-role-bundle.js";
import type { OnboardingSessionStore } from "../storage/onboarding-session-store.js";
import type { UserStore } from "../storage/user-store.js";
import type {
  BillingService,
  OnboardingSession,
  PromptButton,
  PromptChannel,
  RoleActivator,
  UserRecord
} from "../types.js";

export class OnboardingEngine {
  public constructor(
    private readonly deps: {
      sessionStore: OnboardingSessionStore;
      userStore: UserStore;
      messenger: PromptChannel;
      activator: RoleActivator;
      billing?: BillingService;
      repoRoot?: string;
    }
  ) {}

  public async start(
    userId: string,
    roleSlug: string,
    channel: OnboardingSession["channel"]
  ): Promise<OnboardingSession> {
    const bundle = await loadRoleBundle(roleSlug, this.deps.repoRoot);
    const session = await this.deps.sessionStore.create({ userId, roleSlug, channel });
    await this.sendQuestion(userId, bundle, session.step);
    return session;
  }

  public async handleAnswer(
    userId: string,
    sessionId: string,
    answer: string
  ): Promise<OnboardingSession> {
    const session = await this.deps.sessionStore.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Onboarding session not found");
    }

    const bundle = await loadRoleBundle(session.roleSlug, this.deps.repoRoot);
    const question = bundle.onboarding.questions[session.step];
    if (!question) {
      throw new Error("Onboarding session is already complete");
    }

    session.answers[question.id] = answer;
    session.step += 1;

    const isComplete = session.step >= bundle.onboarding.questions.length;
    if (isComplete) {
      session.completedAt = new Date();
      await this.deps.sessionStore.save(session);
      await this.completeOnboarding(session, bundle);
      await this.deps.sessionStore.delete(session.id);
    } else {
      await this.deps.sessionStore.save(session);
      await this.sendQuestion(userId, bundle, session.step);
    }

    return session;
  }

  public async getStatus(sessionId: string): Promise<OnboardingSession | undefined> {
    return this.deps.sessionStore.findById(sessionId);
  }

  public async getStatusForUser(userId: string): Promise<OnboardingSession | undefined> {
    return this.deps.sessionStore.findActiveByUserId(userId);
  }

  private async completeOnboarding(session: OnboardingSession, bundle: RoleBundle): Promise<void> {
    const user = await this.requireUser(session.userId);
    const activation = await this.deps.activator.activate(user, session.roleSlug, session.answers);

    user.activeRole = activation.roleSlug;
    if (!user.name) {
      const derivedName = session.answers.name_brokerage?.split(",")[0]?.trim();
      if (derivedName) {
        user.name = derivedName;
      }
    }
    if (!user.email && session.answers.email) {
      user.email = session.answers.email;
    }
    await this.deps.userStore.save(user);
    if (this.deps.billing) {
      await this.deps.billing.startTrial(user.id, session.roleSlug);
    }

    const firstName = session.answers.name_brokerage?.split(",")[0]?.trim() ?? "there";
    const digestTime = session.answers.digest_time ?? "7:00 AM";

    await this.deps.messenger.sendInteractive(
      user.phone,
      `You're live, ${firstName}.\n\nYour ${bundle.name} is configured and ready.\nTomorrow at ${digestTime} you'll get your first digest. Try one of these next:`,
      [
        { id: "search_listings", title: "Search listings" },
        { id: "schedule_showing", title: "Schedule showing" },
        { id: "draft_followup", title: "Draft follow-up" }
      ]
    );
  }

  private async sendQuestion(userId: string, bundle: RoleBundle, stepIndex: number): Promise<void> {
    const user = await this.requireUser(userId);
    const question = bundle.onboarding.questions[stepIndex];
    if (!question) {
      throw new Error(`Question ${stepIndex} not found for ${bundle.slug}`);
    }

    const progress = `*${stepIndex + 1} of ${bundle.onboarding.questions.length}* - `;
    if (question.type === "choice" && question.choices?.length) {
      const buttons = clampButtons(question.choices);
      await this.deps.messenger.sendInteractive(user.phone, progress + question.text, buttons);
      return;
    }

    await this.deps.messenger.sendText(user.phone, progress + question.text);
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.deps.userStore.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return user;
  }
}

function clampButtons(choices: string[]): PromptButton[] {
  return choices.slice(0, 3).map((choice, index) => ({
    id: `choice_${index}`,
    title: choice.slice(0, 20)
  }));
}
