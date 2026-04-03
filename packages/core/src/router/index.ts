import type { RoleBundle, Workflow } from "@clawsuit/marketplace";

import { loadRoleBundleFromFile } from "@clawsuit/marketplace";
import path from "node:path";

export interface RouterInput {
  user: { id: string; phone: string };
  role: { roleSlug: string; config: Record<string, string> };
  text?: string;
  channel: "whatsapp" | "telegram" | "slack";
}

export interface SkillExecutor {
  execute(input: unknown): Promise<unknown>;
}

export interface SkillRegistry {
  load(skillId: string, userId: string): Promise<SkillExecutor>;
}

export interface ConversationProxy {
  sendMessage(userId: string, message: string): Promise<string>;
}

export interface ChannelResponder {
  send(channel: RouterInput["channel"], phone: string, text: string): Promise<void>;
}

export class IntentRouter {
  public constructor(
    private readonly deps: {
      skillRegistry: SkillRegistry;
      conversationProxy: ConversationProxy;
      responder: ChannelResponder;
      repoRoot?: string;
    }
  ) {}

  public async route(input: RouterInput): Promise<void> {
    const bundle = await this.loadBundle(input.role.roleSlug);
    const messageText = input.text ?? "";

    const matchedWorkflow = bundle.workflows
      .filter((workflow) => workflow.trigger.type === "intent")
      .find((workflow) => new RegExp(workflow.trigger.value, "i").test(messageText));

    if (matchedWorkflow) {
      await this.executeWorkflow(matchedWorkflow, input, bundle);
      return;
    }

    const response = await this.deps.conversationProxy.sendMessage(input.user.id, messageText);
    await this.deps.responder.send(input.channel, input.user.phone, response);
  }

  public async executeWorkflowById(workflowId: string, input: Omit<RouterInput, "text"> & { text?: string }): Promise<void> {
    const bundle = await this.loadBundle(input.role.roleSlug);
    const workflow = bundle.workflows.find((candidate) => candidate.id === workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found for role ${input.role.roleSlug}`);
    }

    await this.executeWorkflow(workflow, input, bundle);
  }

  public resolveTemplates(input: unknown, context: Record<string, unknown>): unknown {
    if (typeof input === "string") {
      return input.replace(/\{\{([^}]+)\}\}/g, (_match, token) => {
        const value = this.resolvePath(token.trim().split("."), context);
        return value == null ? "" : String(value);
      });
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.resolveTemplates(item, context));
    }

    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, this.resolveTemplates(value, context)])
      );
    }

    return input;
  }

  private resolvePath(pathSegments: string[], context: Record<string, unknown>): unknown {
    let current: unknown = context;

    for (const key of pathSegments) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private async executeWorkflow(workflow: Workflow, input: Omit<RouterInput, "text"> & { text?: string }, bundle: RoleBundle): Promise<void> {
    const context: Record<string, unknown> = {
      message: { text: input.text ?? "" },
      user: input.user,
      onboarding: input.role.config,
      role: bundle.slug
    };

    for (const step of workflow.steps) {
      const skill = await this.deps.skillRegistry.load(step.skill, input.user.id);
      const resolvedInput = this.resolveTemplates(step.input, context);
      const result = await skill.execute(resolvedInput);

      if (step.output) {
        context[step.output] = result;
      }
    }
  }

  private async loadBundle(roleSlug: string): Promise<RoleBundle> {
    const bundlePath = path.resolve(this.deps.repoRoot ?? process.cwd(), "roles", roleSlug, "bundle.yaml");
    return loadRoleBundleFromFile(bundlePath);
  }
}
