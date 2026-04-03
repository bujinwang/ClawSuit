import type { FastifyReply, FastifyRequest } from "fastify";

import type { OnboardingEngine, UserStore } from "@clawsuit/api";

export interface WhatsAppTextMessage {
  from: string;
  id?: string;
  type: "text";
  text?: { body?: string };
}

export interface WhatsAppAudioMessage {
  from: string;
  id?: string;
  type: "audio";
  audio?: { id: string };
}

export interface WhatsAppInteractiveMessage {
  from: string;
  id?: string;
  type: "interactive";
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

export type WhatsAppMessage = WhatsAppTextMessage | WhatsAppAudioMessage | WhatsAppInteractiveMessage;

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id: string };
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
}

export interface TranscriptionService {
  transcribeByMediaId(mediaId: string): Promise<string>;
}

export interface IntentRouter {
  route(input: { userId: string; roleSlug: string; text: string; channel: string }): Promise<void>;
}

export interface WhatsAppRouteDeps {
  userStore: UserStore;
  onboardingEngine: OnboardingEngine;
  verifyToken: string;
  appSecret: string;
  transcriber: TranscriptionService;
  intentRouter: IntentRouter;
}

export type PreHandlerLike = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
