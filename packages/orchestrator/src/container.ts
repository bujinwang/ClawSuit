import { mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import type { ContainerInstance, ContainerRuntime, InstanceRegistry } from "./types.js";

const DEFAULT_BASE_PORT = 13000;
const DEFAULT_OPENCLAW_IMAGE = "ghcr.io/openclaw/openclaw:latest";
const DEFAULT_DATA_DIR = "/data/openclaw";
const INSTANCE_MEMORY_BYTES = 512 * 1024 * 1024;
const INSTANCE_NANO_CPUS = 500_000_000;

export class ContainerManager {
  public constructor(
    private readonly deps: {
      runtime: ContainerRuntime;
      registry: InstanceRegistry;
      basePort?: number;
      baseConfigDir?: string;
      openClawImage?: string;
      anthropicApiKey?: string;
    }
  ) {}

  public async provision(userId: string): Promise<ContainerInstance> {
    const existing = await this.deps.registry.getByUserId(userId);
    if (existing) {
      return existing;
    }

    const port = await this.allocatePort();
    const configVolumePath = path.join(this.deps.baseConfigDir ?? DEFAULT_DATA_DIR, userId);
    const workspacePath = path.join(configVolumePath, "workspace");
    await mkdir(workspacePath, { recursive: true });

    const gatewayToken = crypto.randomBytes(16).toString("hex");
    const container = await this.deps.runtime.createContainer({
      name: `clawsuit-${userId.slice(0, 8)}`,
      image: this.deps.openClawImage ?? DEFAULT_OPENCLAW_IMAGE,
      env: [
        `ANTHROPIC_API_KEY=${this.deps.anthropicApiKey ?? ""}`,
        "OPENCLAW_CONFIG_DIR=/home/node/.openclaw",
        `GATEWAY_TOKEN=${gatewayToken}`,
        "PORT=3000",
        "OPENCLAW_CHANNEL=none"
      ],
      binds: [
        `${configVolumePath}:/home/node/.openclaw`,
        `${workspacePath}:/home/node/.openclaw/workspace`
      ],
      hostPort: port,
      memoryBytes: INSTANCE_MEMORY_BYTES,
      nanoCpus: INSTANCE_NANO_CPUS
    });

    await container.start();

    const instance: ContainerInstance = {
      containerId: container.id,
      userId,
      port,
      configVolumePath,
      status: "running",
      containerHost: "localhost",
      gatewayToken
    };

    await this.deps.registry.save(instance);
    return instance;
  }

  public async pause(userId: string): Promise<void> {
    const instance = await this.deps.registry.getByUserId(userId);
    if (!instance) {
      throw new Error(`No container for user ${userId}`);
    }

    instance.status = "paused";
    await this.deps.registry.save(instance);
  }

  private async allocatePort(): Promise<number> {
    const usedPorts = new Set((await this.deps.registry.list()).map((instance) => instance.port));
    let port = this.deps.basePort ?? DEFAULT_BASE_PORT;
    while (usedPorts.has(port)) {
      port += 1;
    }
    return port;
  }
}
