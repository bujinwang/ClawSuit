import { describe, expect, it } from "vitest";

import { MetaWhatsAppMediaResolver } from "./whatsapp-media.js";

describe("MetaWhatsAppMediaResolver", () => {
  it("fetches media metadata and downloads the binary asset", async () => {
    const calls: string[] = [];
    const resolver = new MetaWhatsAppMediaResolver({
      accessToken: "wa_token",
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/12345")) {
          return new Response(JSON.stringify({ url: "https://media.example/file", mime_type: "audio/ogg" }), { status: 200 });
        }
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
    });

    const asset = await resolver.resolve("12345");
    expect(calls).toEqual([
      "https://graph.facebook.com/v20.0/12345",
      "https://media.example/file"
    ]);
    expect(asset.mimeType).toBe("audio/ogg");
    expect(new Uint8Array(asset.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
