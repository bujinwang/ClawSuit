import type { FastifyInstance } from "fastify";

import type { CredentialService } from "../credentials.js";

export function registerCredentialRoutes(app: FastifyInstance, credentials: CredentialService): void {
  app.post("/api/v1/credentials/setup-link", async (request) => {
    const body = request.body as { userId: string; service: string };
    const url = await credentials.generateCredentialSetupLink(body.userId, body.service);
    return { url };
  });

  app.post("/api/v1/credentials/:token/save", async (request) => {
    const params = request.params as { token: string };
    const body = request.body as Record<string, string>;
    await credentials.saveCredential(params.token, body);
    return { ok: true };
  });

  app.get("/api/v1/credentials", async (request) => {
    const query = request.query as { userId: string };
    return credentials.listCredentials(query.userId);
  });

  app.get("/connect/:service", async (request, reply) => {
    const params = request.params as { service: string };
    const query = request.query as { token: string };
    const html = await credentials.renderSetupPage(query.token, params.service);
    reply.type("text/html").send(html);
  });
}
