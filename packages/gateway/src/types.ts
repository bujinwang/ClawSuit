import type { FastifyReply, FastifyRequest } from "fastify";

import type { OnboardingEngine, UserStore } from "@clawsuit/api";
import type { RouterInput } from "@clawsuit/core";

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
  route(input: RouterInput): Promise<void>;
}

export interface WhatsAppRouteDeps {
  userStore: UserStore;
  onboardingEngine: OnboardingEngine;
  verifyToken: string;
  appSecret: string;
  transcriber: TranscriptionService;
  intentRouter: IntentRouter;
  rateLimiter?: {
    enforce(key: string): Promise<void>;
  };
}

export type PreHandlerLike = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
