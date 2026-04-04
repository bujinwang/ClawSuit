import { CredentialService, type UserStore } from "@clawsuit/api";
import {
  GoogleCalendarSkill,
  IntentRouter,
  Pillar9Skill,
  type ChannelResponder,
  type ConversationProxy,
  type SkillExecutor,
  type SkillRegistry
} from "@clawsuit/core";

import { WhatsAppSender } from "./channels/whatsapp-send.js";
import type { LlmProvider } from "./llm.js";

class CredentialBackedUserCredentialStore {
  public constructor(private readonly credentials: CredentialService) {}

  public async get(userId: string, service: string): Promise<Record<string, string> | undefined> {
    return this.credentials.getCredential(userId, service);
  }
}

export function createGatewayIntentRouter(deps: {
  repoRoot: string;
  credentials: CredentialService;
  conversationProxy: ConversationProxy;
  whatsappSender: WhatsAppSender;
  userStore: UserStore;
  llmProvider: LlmProvider;
}): IntentRouter {
  const credentialStore = new CredentialBackedUserCredentialStore(deps.credentials);

  const skillRegistry: SkillRegistry = {
    load: async (skillId: string, userId: string): Promise<SkillExecutor> => {
      switch (skillId) {
        case "mls-search": {
          const pillar9 = new Pillar9Skill(userId, credentialStore);
          return { execute: async (input) => pillar9.search(input as Parameters<Pillar9Skill["search"]>[0]) };
        }
        case "google-calendar": {
          const calendar = new GoogleCalendarSkill(userId, credentialStore);
          return {
            execute: async (input) => {
              const data = input as Record<string, string>;
              if (data.action === "create_event") {
                if (!data.title || !data.datetime) {
                  throw new Error("google-calendar create_event requires title and datetime");
                }
                return calendar.createEvent({
                  title: data.title,
                  datetime: data.datetime,
                  ...(data.attendees ? { attendees: data.attendees } : {})
                });
              }

              return calendar.listEvents(data.date ?? new Date().toISOString().slice(0, 10), Number(data.lookahead_hours ?? "24"));
            }
          };
        }
        case "whatsapp-send":
        case "whatsapp-reply":
          return {
            execute: async (input) => {
              const data = input as Record<string, string>;
              const to = data.to ?? (await deps.userStore.findById(userId))?.phone;
              if (!to) {
                throw new Error(`No WhatsApp destination for user ${userId}`);
              }
              await deps.whatsappSender.sendText(to, data.text ?? JSON.stringify(data));
              return { delivered: true };
            }
          };
        case "llm-format":
          return {
            execute: async (input) => deps.llmProvider.format(
              String((input as Record<string, string>).template ?? "default"),
              input as Record<string, string>
            )
          };
        case "llm-extract":
          return {
            execute: async (input) => {
              const data = input as Record<string, string>;
              return deps.llmProvider.extract(data.text ?? "", data.schema ?? "UnknownSchema");
            }
          };
        case "email-smtp":
        case "pdf-generator":
          return {
            execute: async () => ({ ok: true })
          };
        default:
          throw new Error(`Unsupported skill ${skillId}`);
      }
    }
  };

  const responder: ChannelResponder = {
    send: async (channel, phone, text) => {
      if (channel !== "whatsapp") {
        throw new Error(`Unsupported channel ${channel}`);
      }
      await deps.whatsappSender.sendText(phone, text);
    }
  };

  return new IntentRouter({
    skillRegistry,
    conversationProxy: deps.conversationProxy,
    responder,
    repoRoot: deps.repoRoot
  });
}
