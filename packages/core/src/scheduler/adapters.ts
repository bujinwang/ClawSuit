import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { WorkflowQueue } from "./index.js";

export class BullMqWorkflowQueue implements WorkflowQueue {
  private readonly queue: Queue;

  public constructor(redisUrl: string, queueName = "workflows") {
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(queueName, { connection });
  }

  public async add(
    name: string,
    data: { userId: string; workflowId: string; roleSlug: string },
    options: { repeat: { pattern: string; tz: string }; jobId: string }
  ): Promise<void> {
    await this.queue.add(name, data, options);
  }
}
