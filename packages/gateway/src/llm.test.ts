import { describe, expect, it } from "vitest";

import { OpenAiLlmProvider } from "./llm.js";

describe("OpenAiLlmProvider", () => {
  it("parses JSON responses from chat completions", async () => {
    const provider = new OpenAiLlmProvider({
      apiKey: "sk-test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{\"summary\":\"Daily digest\",\"todaySchedule\":\"2 showings\"}"
                }
              }
            ]
          }),
          { status: 200 }
        )
    });

    const result = await provider.format("digest", { schedule: "2 showings" });
    expect(result.summary).toBe("Daily digest");
    expect(result.todaySchedule).toBe("2 showings");
  });
});
