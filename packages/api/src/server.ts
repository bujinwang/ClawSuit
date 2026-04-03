import { createApiApp } from "./app.js";
import { validateApiEnv } from "@clawsuit/core";
import { fileURLToPath } from "node:url";

export async function buildApiServer(source: Record<string, string | undefined>): Promise<{
  app: ReturnType<typeof createApiApp>;
  env: ReturnType<typeof validateApiEnv>;
}> {
  const env = validateApiEnv(source);
  const app = createApiApp({
    appUrl: env.APP_URL,
    encryptionKeyHex: env.CREDENTIAL_ENCRYPTION_KEY
  });

  return { app, env };
}

async function startFromProcessEnv(): Promise<void> {
  const { app, env } = await buildApiServer(process.env);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startFromProcessEnv();
}
