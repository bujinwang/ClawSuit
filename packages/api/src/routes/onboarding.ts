import type { FastifyInstance } from "fastify";

import type { OnboardingEngine } from "../onboarding/engine.js";

export function registerOnboardingRoutes(app: FastifyInstance, engine: OnboardingEngine): void {
  app.post("/api/v1/onboarding/start", async (request, reply) => {
    const body = request.body as {
      userId: string;
      roleSlug: string;
      channel?: "whatsapp" | "telegram" | "slack" | "email";
    };

    const session = await engine.start(body.userId, body.roleSlug, body.channel ?? "whatsapp");
    return reply.status(201).send({ sessionId: session.id, step: session.step });
  });

  app.post("/api/v1/onboarding/:sessionId/answer", async (request) => {
    const params = request.params as { sessionId: string };
    const body = request.body as { userId: string; answer: string };
    const session = await engine.handleAnswer(body.userId, params.sessionId, body.answer);
    return {
      sessionId: session.id,
      step: session.step,
      completedAt: session.completedAt?.toISOString()
    };
  });

  app.get("/api/v1/onboarding/:sessionId/status", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const session = await engine.getStatus(params.sessionId);

    if (!session) {
      return reply.status(404).send({ error: "Not found" });
    }

    return {
      sessionId: session.id,
      roleSlug: session.roleSlug,
      step: session.step,
      answers: session.answers,
      completedAt: session.completedAt?.toISOString()
    };
  });
}
