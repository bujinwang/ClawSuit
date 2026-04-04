import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { CompilerOutput } from "@clawsuit/core";

import { ContainerManager } from "./container.js";
import { writeCompiledConfig } from "./file-writer.js";
import { ContainerProxy } from "./proxy.js";
import { InMemoryInstanceRegistry } from "./registry.js";
import type { ContainerRuntime, ContainerTransport, CreateContainerRequest } from "./types.js";

class FakeRuntime implements ContainerRuntime {
  public readonly requests: CreateContainerRequest[] = [];
  public pausedContainerIds: string[] = [];

  public async createContainer(request: CreateContainerRequest): Promise<{ id: string; start(): Promise<void>; stop(): Promise<void> }> {
    this.requests.push(request);
    return {
      id: `container_${this.requests.length}`,
      start: async () => undefined,
      stop: async () => undefined
    };
  }

  public async pauseContainer(containerId: string): Promise<void> {
    this.pausedContainerIds.push(containerId);
  }
}

class FakeTransport implements ContainerTransport {
  public async send(): Promise<string> {
    return "proxy reply";
  }
}

describe("ContainerManager", () => {
  it("provisions a container, writes config, and proxies messages", async () => {
    const runtime = new FakeRuntime();
    const registry = new InMemoryInstanceRegistry();
    const baseConfigDir = await mkdtemp(path.join(tmpdir(), "clawsuit-orch-"));
    const manager = new ContainerManager({ runtime, registry, baseConfigDir, anthropicApiKey: "anthropic" });

    const instance = await manager.provision("user_abc12345");
    expect(instance.port).toBe(13000);
    expect(runtime.requests[0]?.memoryBytes).toBe(512 * 1024 * 1024);

    const files: CompilerOutput["files"] = {
      "AGENTS.md": "# agents",
      "SOUL.md": "# soul",
      "MEMORY.md": "# memory",
      "USER.md": "# user"
    };
    await writeCompiledConfig(instance.configVolumePath, files);
    const written = await readFile(path.join(instance.configVolumePath, "AGENTS.md"), "utf8");
    expect(written).toBe("# agents");

    const proxy = new ContainerProxy({ registry, transport: new FakeTransport() });
    await expect(proxy.sendMessage("user_abc12345", "hello")).resolves.toBe("proxy reply");

    await manager.pause("user_abc12345");
    expect(runtime.pausedContainerIds).toEqual(["container_1"]);
  });
});
