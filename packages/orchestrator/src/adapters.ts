import Docker from "dockerode";

import type { ContainerInstance, ContainerRuntime, ContainerTransport, CreateContainerRequest, InstanceRegistry } from "./types.js";

interface RedisClient {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, member: string): Promise<number>;
}

const INSTANCE_PREFIX = "clawsuit:instance:";
const INSTANCE_INDEX = "clawsuit:instances";

export class RedisInstanceRegistry implements InstanceRegistry {
  public constructor(private readonly redis: RedisClient) {}

  public async getByUserId(userId: string): Promise<ContainerInstance | undefined> {
    const raw = await this.redis.get(`${INSTANCE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as ContainerInstance) : undefined;
  }

  public async list(): Promise<ContainerInstance[]> {
    const userIds = await this.redis.smembers(INSTANCE_INDEX);
    const instances = await Promise.all(userIds.map((userId) => this.getByUserId(userId)));
    return instances.filter((instance): instance is ContainerInstance => Boolean(instance));
  }

  public async save(instance: ContainerInstance): Promise<void> {
    await this.redis.set(`${INSTANCE_PREFIX}${instance.userId}`, JSON.stringify(instance));
    await this.redis.sadd(INSTANCE_INDEX, instance.userId);
  }
}

export class DockerContainerRuntime implements ContainerRuntime {
  private readonly docker: Docker;

  public constructor(socketPath = "/var/run/docker.sock") {
    this.docker = new Docker({ socketPath });
  }

  public async createContainer(request: CreateContainerRequest): Promise<{ id: string; start(): Promise<void>; stop(): Promise<void> }> {
    const container = await (this.docker.createContainer({
      Image: request.image,
      name: request.name,
      Env: request.env,
      HostConfig: {
        Binds: request.binds,
        PortBindings: {
          "3000/tcp": [{ HostPort: String(request.hostPort) }]
        },
        RestartPolicy: { Name: "unless-stopped" },
        Memory: request.memoryBytes,
        NanoCpus: request.nanoCpus
      }
    }) as unknown as Promise<Docker.Container>);

    return {
      id: container.id,
      start: async () => container.start(),
      stop: async () => container.stop()
    };
  }

  public async pauseContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).pause();
  }
}

export class HttpContainerTransport implements ContainerTransport {
  public constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  public async send(instance: ContainerInstance, message: string): Promise<string> {
    const response = await this.fetchImpl(`http://${instance.containerHost}:${instance.port}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instance.gatewayToken}`
      },
      body: JSON.stringify({ message, channel: "api" })
    });

    if (!response.ok) {
      throw new Error(`Container proxy request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { reply?: string };
    return payload.reply ?? "";
  }
}
