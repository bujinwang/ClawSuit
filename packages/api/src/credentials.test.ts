import { describe, expect, it } from "vitest";

import { CredentialService, InMemoryCredentialRepository, InMemorySetupTokenStore } from "./credentials.js";

describe("CredentialService", () => {
  it("encrypts, saves, and decrypts credentials via setup token", async () => {
    const service = new CredentialService({
      encryptionKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      repository: new InMemoryCredentialRepository(),
      setupTokens: new InMemorySetupTokenStore(),
      appUrl: "https://clawsuit.io"
    });

    const url = await service.generateCredentialSetupLink("user_1", "pillar9");
    const token = new URL(url).searchParams.get("token");
    expect(token).toBeTruthy();

    await service.saveCredential(token!, {
      accessToken: "secret-access",
      refreshToken: "secret-refresh"
    });

    const decrypted = await service.getCredential("user_1", "pillar9");
    expect(decrypted?.accessToken).toBe("secret-access");
    expect((await service.listCredentials("user_1"))[0]?.service).toBe("pillar9");
  });
});
