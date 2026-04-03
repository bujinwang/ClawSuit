import crypto from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { WhatsAppMessage, WhatsAppRouteDeps, WhatsAppWebhookPayload } from "../types.js";

export function registerWhatsAppRoutes(app: FastifyInstance, deps: WhatsAppRouteDeps): void {
  app.get("/webhook/whatsapp", async (request, reply) => {
    const query = request.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === deps.verifyToken) {
      return reply.send(query["hub.challenge"] ?? "");
    }

    return reply.status(403).send("Forbidden");
  });

  app.post(
    "/webhook/whatsapp",
    {
      preHandler: async (request, reply) => verifyWhatsAppSignature(request.body, request.headers["x-hub-signature-256"], reply, deps.appSecret)
    },
    async (request, reply) => {
      const body = request.body as WhatsAppWebhookPayload;
      reply.status(200).send("OK");

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const message of change.value?.messages ?? []) {
            await processIncomingMessage(message, deps);
          }
        }
      }
    }
  );
}

export async function processIncomingMessage(message: WhatsAppMessage, deps: WhatsAppRouteDeps): Promise<void> {
  const fromPhone = message.from;
  let user = await deps.userStore.findByPhone(fromPhone);

  const text = await extractMessageText(message, deps);
  if (!text) {
    return;
  }

  if (!user) {
    user = await deps.userStore.create(fromPhone);
    await deps.onboardingEngine.start(user.id, "realtor", "whatsapp");
    return;
  }

  const session = await deps.onboardingEngine.getStatusForUser?.(user.id);
  if (session) {
    await deps.onboardingEngine.handleAnswer(user.id, session.id, text);
    return;
  }

  if (!user.activeRole) {
    await deps.onboardingEngine.start(user.id, "realtor", "whatsapp");
    return;
  }

  await deps.intentRouter.route({
    userId: user.id,
    roleSlug: user.activeRole,
    text,
    channel: "whatsapp"
  });
}

export async function extractMessageText(message: WhatsAppMessage, deps: WhatsAppRouteDeps): Promise<string | null> {
  if (message.type === "text") {
    return message.text?.body ?? null;
  }

  if (message.type === "audio") {
    const mediaId = message.audio?.id;
    return mediaId ? deps.transcriber.transcribeByMediaId(mediaId) : null;
  }

  return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
}

export async function verifyWhatsAppSignature(
  payload: unknown,
  signatureHeader: string | string[] | undefined,
  reply: { status(code: number): { send(value: string): void } },
  appSecret: string
): Promise<void> {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(JSON.stringify(payload)).digest("hex")}`;

  if (signature !== expected) {
    reply.status(401).send("Unauthorized");
    throw new Error("Invalid WhatsApp signature");
  }
}
