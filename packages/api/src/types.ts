import type { CompilerOutput } from "@clawsuit/core";

export interface UserRecord {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  activeRole?: string;
  stripeCustomerId?: string;
  trialEndsAt?: Date;
}

export interface OnboardingSession {
  id: string;
  userId: string;
  roleSlug: string;
  step: number;
  answers: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  channel: "whatsapp" | "telegram" | "slack" | "email";
}

export interface PromptButton {
  id: string;
  title: string;
}

export interface PromptChannel {
  sendText(to: string, text: string): Promise<void>;
  sendInteractive(to: string, body: string, buttons: PromptButton[]): Promise<void>;
}

export interface RoleActivationResult {
  roleSlug: string;
  answers: Record<string, string>;
  compilerOutput: CompilerOutput;
}

export interface RoleActivator {
  activate(user: UserRecord, roleSlug: string, answers: Record<string, string>): Promise<RoleActivationResult>;
}

export interface BillingService {
  startTrial(userId: string, roleSlug: string): Promise<void>;
}
