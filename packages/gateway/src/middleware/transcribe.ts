import { Buffer } from "node:buffer";

import type { TranscriptionService } from "../types.js";

export class OpenAiWhisperTranscriber implements TranscriptionService {
  public constructor(
    private readonly config: {
      openAiApiKey?: string;
      fetchImpl?: typeof fetch;
      mediaResolver?: (mediaId: string) => Promise<{ bytes: ArrayBuffer; mimeType: string; filename: string }>;
    } = {}
  ) {}

  public async transcribeByMediaId(mediaId: string): Promise<string> {
    if (!this.config.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required for audio transcription");
    }

    if (!this.config.mediaResolver) {
      throw new Error("A mediaResolver is required to transcribe WhatsApp audio");
    }

    const media = await this.config.mediaResolver(mediaId);
    const file = new File([Buffer.from(media.bytes)], media.filename, { type: media.mimeType });
    const form = new FormData();
    form.append("file", file);
    form.append("model", "whisper-1");

    const response = await (this.config.fetchImpl ?? fetch)("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openAiApiKey}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Whisper transcription failed with ${response.status}`);
    }

    const payload = (await response.json()) as { text?: string };
    return payload.text ?? "";
  }
}

export class StubTranscriber implements TranscriptionService {
  public constructor(private readonly text = "") {}

  public async transcribeByMediaId(): Promise<string> {
    return this.text;
  }
}
