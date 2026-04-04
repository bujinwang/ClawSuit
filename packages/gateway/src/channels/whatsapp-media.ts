export interface MediaAsset {
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
}

export class MetaWhatsAppMediaResolver {
  public constructor(
    private readonly config: {
      accessToken: string;
      fetchImpl?: typeof fetch;
      apiBase?: string;
    }
  ) {}

  public async resolve(mediaId: string): Promise<MediaAsset> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const apiBase = this.config.apiBase ?? "https://graph.facebook.com/v20.0";

    const metadataResponse = await fetchImpl(`${apiBase}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`
      }
    });
    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch WhatsApp media metadata: ${metadataResponse.status}`);
    }

    const metadata = (await metadataResponse.json()) as { url?: string; mime_type?: string };
    if (!metadata.url) {
      throw new Error("WhatsApp media metadata did not include a download URL");
    }

    const mediaResponse = await fetchImpl(metadata.url, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`
      }
    });
    if (!mediaResponse.ok) {
      throw new Error(`Failed to download WhatsApp media: ${mediaResponse.status}`);
    }

    return {
      bytes: await mediaResponse.arrayBuffer(),
      mimeType: metadata.mime_type ?? "audio/ogg",
      filename: `${mediaId}.ogg`
    };
  }
}
