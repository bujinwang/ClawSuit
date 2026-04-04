export interface LlmProvider {
  format(template: string, input: Record<string, string>): Promise<Record<string, string>>;
  extract(text: string, schema: string): Promise<Record<string, string>>;
}

export class OpenAiLlmProvider implements LlmProvider {
  public constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      fetchImpl?: typeof fetch;
    }
  ) {}

  public async format(template: string, input: Record<string, string>): Promise<Record<string, string>> {
    return this.requestJson(
      [
        "You format workflow data into concise assistant outputs.",
        `Template: ${template}`,
        `Input: ${JSON.stringify(input)}`
      ].join("\n")
    );
  }

  public async extract(text: string, schema: string): Promise<Record<string, string>> {
    return this.requestJson(
      [
        "Extract structured fields from the user message.",
        `Schema name: ${schema}`,
        `Message: ${text}`
      ].join("\n")
    );
  }

  private async requestJson(prompt: string): Promise<Record<string, string>> {
    const response = await (this.config.fetchImpl ?? fetch)("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model ?? "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return only valid JSON objects with string values."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat completion failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(content) as Record<string, string>;
  }
}

export class StubLlmProvider implements LlmProvider {
  public async format(_template: string, input: Record<string, string>): Promise<Record<string, string>> {
    return {
      summary: `Generated summary for ${JSON.stringify(input)}`,
      todaySchedule: "No conflicts"
    };
  }

  public async extract(text: string, _schema: string): Promise<Record<string, string>> {
    return {
      text,
      datetime: new Date().toISOString(),
      address: "Unknown address",
      clientEmail: ""
    };
  }
}
