import type { UserCredentialStore } from "./types.js";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
}

export class GoogleCalendarSkill {
  private readonly baseUrl = "https://www.googleapis.com/calendar/v3";

  public constructor(
    private readonly userId: string,
    private readonly credentialStore: UserCredentialStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  public async listEvents(date: string, lookaheadHours = 24): Promise<CalendarEvent[]> {
    const token = await this.getAccessToken();
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + lookaheadHours * 3600000);
    const url = `${this.baseUrl}/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime`;
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Google Calendar request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
    return (payload.items ?? []).map((event) => ({
      id: String(event.id ?? ""),
      title: String(event.summary ?? ""),
      start: String((event.start as { dateTime?: string } | undefined)?.dateTime ?? ""),
      end: String((event.end as { dateTime?: string } | undefined)?.dateTime ?? ""),
      ...(Array.isArray(event.attendees)
        ? {
            attendees: event.attendees
              .map((attendee) => String((attendee as { email?: string }).email ?? ""))
              .filter(Boolean)
          }
        : {})
    }));
  }

  public async createEvent(input: {
    title: string;
    datetime: string;
    attendees?: string;
  }): Promise<CalendarEvent> {
    const token = await this.getAccessToken();
    const start = new Date(input.datetime);
    const end = new Date(start.getTime() + 60 * 60000);
    const response = await this.fetchImpl(`${this.baseUrl}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: input.title,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: input.attendees ? [{ email: input.attendees }] : []
      })
    });

    if (!response.ok) {
      throw new Error(`Google Calendar create failed with ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      id: String(payload.id ?? ""),
      title: String(payload.summary ?? ""),
      start: String((payload.start as { dateTime?: string } | undefined)?.dateTime ?? ""),
      end: String((payload.end as { dateTime?: string } | undefined)?.dateTime ?? "")
    };
  }

  private async getAccessToken(): Promise<string> {
    const creds = await this.credentialStore.get(this.userId, "google_calendar");
    if (!creds?.accessToken) {
      throw new Error(`Missing google_calendar credentials for user ${this.userId}`);
    }
    return creds.accessToken;
  }
}
