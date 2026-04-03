import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadRoleBundleFromFile } from "@clawsuit/marketplace";

import { resolveCron, scheduleRoleWorkflows, type WorkflowQueue } from "./index.js";

class FakeWorkflowQueue implements WorkflowQueue {
  public readonly jobs: Array<{ name: string; data: { userId: string; workflowId: string; roleSlug: string }; options: { repeat: { pattern: string; tz: string }; jobId: string } }> = [];

  public async add(
    name: string,
    data: { userId: string; workflowId: string; roleSlug: string },
    options: { repeat: { pattern: string; tz: string }; jobId: string }
  ): Promise<void> {
    this.jobs.push({ name, data, options });
  }
}

describe("scheduleRoleWorkflows", () => {
  it("schedules cron workflows using the onboarding digest time", async () => {
    const bundle = await loadRoleBundleFromFile(path.resolve(process.cwd(), "../../roles/realtor/bundle.yaml"));
    const queue = new FakeWorkflowQueue();

    await scheduleRoleWorkflows(
      { workflowQueue: queue },
      "user_1",
      bundle,
      { digest_time: "8:00 AM" }
    );

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.options.repeat.pattern).toBe("0 8 * * *");
    expect(queue.jobs[0]?.name).toBe("user_1-morning-digest");
  });

  it("parses digest time into cron safely", () => {
    expect(resolveCron("0 7 * * *", { digest_time: "6:30 AM" })).toBe("30 6 * * *");
  });
});
