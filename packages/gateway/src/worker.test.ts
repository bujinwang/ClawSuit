import { describe, expect, it } from "vitest";

import { InMemoryUserStore } from "@clawsuit/api";

import { createWorkflowJobProcessor } from "./worker.js";

describe("createWorkflowJobProcessor", () => {
  it("executes the scheduled workflow for the user active role", async () => {
    const userStore = new InMemoryUserStore();
    const user = await userStore.create("+17805550123");
    await userStore.save({
      ...user,
      activeRole: "realtor",
      activeRoleConfig: { digest_time: "8:00 AM" }
    });

    const executed: string[] = [];
    const processor = createWorkflowJobProcessor({
      userStore,
      router: {
        executeWorkflowById: async (workflowId: string) => {
          executed.push(workflowId);
        }
      }
    });

    await processor({
      data: {
        userId: user.id,
        workflowId: "morning-digest",
        roleSlug: "realtor"
      }
    });

    expect(executed).toEqual(["morning-digest"]);
  });
});
