import Fastify, { type FastifyInstance } from "fastify";

import { registerWhatsAppRoutes } from "./channels/whatsapp.js";
import type { WhatsAppRouteDeps } from "./types.js";

export function createGatewayApp(deps: WhatsAppRouteDeps): FastifyInstance {
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, route: request.routeOptions.url }, "gateway request failed");
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const statusCode = message === "Rate limit exceeded" ? 429 : 500;
    reply.status(statusCode).send({ error: message });
  });

  app.get("/health", async () => ({ ok: true }));
  registerWhatsAppRoutes(app, deps);
  return app;
}
