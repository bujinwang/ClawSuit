import type { ContainerTransport, InstanceRegistry } from "./types.js";

export class ContainerProxy {
  public constructor(
    private readonly deps: {
      registry: InstanceRegistry;
      transport: ContainerTransport;
    }
  ) {}

  public async sendMessage(userId: string, message: string): Promise<string> {
    const instance = await this.deps.registry.getByUserId(userId);
    if (!instance) {
      throw new Error(`No container for user ${userId}`);
    }

    if (instance.status !== "running") {
      throw new Error(`Container for user ${userId} is ${instance.status}`);
    }

    return this.deps.transport.send(instance, message);
  }
}
