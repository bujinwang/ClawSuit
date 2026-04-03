import path from "node:path";

import { compileRole, scheduleRoleWorkflows, type CompilerOutput, type WorkflowQueue } from "@clawsuit/core";

import { loadRoleBundle } from "../roles/load-role-bundle.js";
import type { RoleActivationResult, RoleActivator, UserRecord } from "../types.js";

export class CompilerRoleActivator implements RoleActivator {
  public constructor(
    private readonly options: {
      repoRoot?: string;
      outputRoot?: string;
      workflowQueue?: WorkflowQueue;
    } = {}
  ) {}

  public async activate(
    user: UserRecord,
    roleSlug: string,
    answers: Record<string, string>
  ): Promise<RoleActivationResult> {
    const repoRoot = this.options.repoRoot ?? process.cwd();
    const bundle = await loadRoleBundle(roleSlug, repoRoot);
    const outputDir = path.resolve(
      this.options.outputRoot ?? path.join(repoRoot, ".generated"),
      user.id,
      roleSlug
    );

    const compilerOutput: CompilerOutput = await compileRole({
      bundle,
      answers,
      user,
      outputDir
    });

    if (this.options.workflowQueue) {
      await scheduleRoleWorkflows(
        { workflowQueue: this.options.workflowQueue },
        user.id,
        bundle,
        answers
      );
    }

    return {
      roleSlug,
      answers,
      compilerOutput
    };
  }
}
