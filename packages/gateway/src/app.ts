import Fastify, { type FastifyInstance } from "fastify";

import { registerWhatsAppRoutes } from "./channels/whatsapp.js";
import type { WhatsAppRouteDeps } from "./types.js";

export function createGatewayApp(deps: WhatsAppRouteDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));
  registerWhatsAppRoutes(app, deps);
  return app;
}
