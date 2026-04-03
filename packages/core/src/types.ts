import type { RoleBundle } from "@clawsuit/marketplace";

export interface CompilerInput {
  bundle: RoleBundle;
  answers: Record<string, string>;
  user: {
    id: string;
    phone: string;
    email?: string;
    name?: string;
  };
  outputDir?: string;
}

export interface CompilerOutput {
  files: {
    "AGENTS.md": string;
    "SOUL.md": string;
    "MEMORY.md": string;
    "USER.md": string;
  };
  compiledAt: Date;
}

export interface CompilerContext {
  role: RoleBundle;
  onboarding: Record<string, string>;
  user: CompilerInput["user"];
  firstName: string;
  brokerage: string;
  markets: string[];
  digestTime: {
    hour: number;
    minute: number;
    label: string;
  };
  tone: string;
}
