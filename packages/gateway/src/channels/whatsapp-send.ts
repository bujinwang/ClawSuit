const WA_API_BASE = "https://graph.facebook.com/v20.0";

export interface WhatsAppSenderConfig {
  phoneNumberId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export class WhatsAppSender {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly config: WhatsAppSenderConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async sendText(to: string, text: string): Promise<void> {
    await this.send({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text, preview_url: false }
    });
  }

  public async sendTemplate(to: string, templateName: string, variables: string[]): Promise<void> {
    await this.send({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_CA" },
        components: [
          {
            type: "body",
            parameters: variables.map((value) => ({ type: "text", text: value }))
          }
        ]
      }
    });
  }

  public async sendInteractive(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<void> {
    await this.send({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((button) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title.slice(0, 20)
            }
          }))
        }
      }
    });
  }

  private async send(payload: unknown): Promise<void> {
    const response = await this.fetchImpl(`${WA_API_BASE}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API request failed with ${response.status}`);
    }
  }
}
