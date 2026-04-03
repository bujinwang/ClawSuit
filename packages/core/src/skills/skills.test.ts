import { describe, expect, it } from "vitest";

import { GoogleCalendarSkill } from "./google-calendar.js";
import { Pillar9Skill } from "./pillar9.js";
import type { UserCredentialStore } from "./types.js";

class StaticCredentialStore implements UserCredentialStore {
  public async get(_userId: string, service: string): Promise<Record<string, string> | undefined> {
    if (service === "pillar9" || service === "google_calendar") {
      return { accessToken: "token" };
    }
    return undefined;
  }
}

describe("Pillar9Skill", () => {
  it("builds filters for closed sales", () => {
    const skill = new Pillar9Skill("user_1", new StaticCredentialStore(), async () => new Response(JSON.stringify({ value: [] }), { status: 200 }));
    const filter = skill.buildODataFilter({ markets: "Edmonton", filter: "sold_last_90d" });
    expect(filter).toContain("StandardStatus eq 'Closed'");
    expect(filter).toContain("City eq 'Edmonton'");
  });
});

describe("GoogleCalendarSkill", () => {
  it("creates an event against the Google Calendar API", async () => {
    const skill = new GoogleCalendarSkill(
      "user_1",
      new StaticCredentialStore(),
      async () =>
        new Response(
          JSON.stringify({
            id: "evt_123",
            summary: "Showing",
            start: { dateTime: "2026-04-04T13:00:00.000Z" },
            end: { dateTime: "2026-04-04T14:00:00.000Z" }
          }),
          { status: 200 }
        )
    );

    const event = await skill.createEvent({
      title: "Showing",
      datetime: "2026-04-04T13:00:00.000Z",
      attendees: "buyer@example.com"
    });

    expect(event.id).toBe("evt_123");
    expect(event.title).toBe("Showing");
  });
});
