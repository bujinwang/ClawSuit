export interface ContainerInstance {
  containerId: string;
  userId: string;
  port: number;
  configVolumePath: string;
  status: "running" | "stopped" | "paused" | "error";
  containerHost: string;
  gatewayToken: string;
}

export interface CreateContainerRequest {
  name: string;
  image: string;
  env: string[];
  binds: string[];
  hostPort: number;
  memoryBytes: number;
  nanoCpus: number;
}

export interface ContainerRuntime {
  createContainer(request: CreateContainerRequest): Promise<{ id: string; start(): Promise<void>; stop(): Promise<void> }>;
  pauseContainer?(containerId: string): Promise<void>;
}

export interface InstanceRegistry {
  getByUserId(userId: string): Promise<ContainerInstance | undefined>;
  list(): Promise<ContainerInstance[]>;
  save(instance: ContainerInstance): Promise<void>;
}

export interface ContainerTransport {
  send(instance: ContainerInstance, message: string): Promise<string>;
}
