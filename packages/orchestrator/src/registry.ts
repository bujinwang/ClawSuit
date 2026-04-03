import type { ContainerInstance, InstanceRegistry } from "./types.js";

export class InMemoryInstanceRegistry implements InstanceRegistry {
  private readonly byUserId = new Map<string, ContainerInstance>();

  public async getByUserId(userId: string): Promise<ContainerInstance | undefined> {
    return this.byUserId.get(userId);
  }

  public async list(): Promise<ContainerInstance[]> {
    return [...this.byUserId.values()];
  }

  public async save(instance: ContainerInstance): Promise<void> {
    this.byUserId.set(instance.userId, instance);
  }
}
