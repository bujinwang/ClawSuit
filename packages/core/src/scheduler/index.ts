import type { RoleBundle } from "@clawsuit/marketplace";

export interface WorkflowQueue {
  add(
    name: string,
    data: { userId: string; workflowId: string; roleSlug: string },
    options: { repeat: { pattern: string; tz: string }; jobId: string }
  ): Promise<void>;
}

export interface SchedulerContext {
  workflowQueue: WorkflowQueue;
  timezone?: string;
}

export function resolveCron(template: string, answers: Record<string, string>): string {
  if (template !== "0 7 * * *") {
    return template;
  }

  const digestTime = answers.digest_time ?? "7:00 AM";
  const match = digestTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return template;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = (match[3] ?? "AM").toUpperCase();

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return `${minute} ${hour} * * *`;
}

export async function scheduleRoleWorkflows(
  context: SchedulerContext,
  userId: string,
  bundle: RoleBundle,
  answers: Record<string, string>
): Promise<void> {
  for (const workflow of bundle.workflows) {
    if (workflow.trigger.type !== "cron") {
      continue;
    }

    const cron = resolveCron(workflow.trigger.value, answers);
    const jobId = `${userId}-${workflow.id}`;
    await context.workflowQueue.add(
      jobId,
      { userId, workflowId: workflow.id, roleSlug: bundle.slug },
      {
        repeat: { pattern: cron, tz: context.timezone ?? "America/Edmonton" },
        jobId
      }
    );
  }
}
