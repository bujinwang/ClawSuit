import { readFile } from "node:fs/promises";
import yaml from "js-yaml";

import { RoleBundleSchema, type RoleBundle } from "./schema/roleBundle.js";

export class RoleBundleValidationError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(`Invalid role bundle:\n- ${issues.join("\n- ")}`);
    this.name = "RoleBundleValidationError";
    this.issues = issues;
  }
}

export function validateRoleBundle(input: unknown): RoleBundle {
  const parsed = RoleBundleSchema.safeParse(input);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    throw new RoleBundleValidationError(issues);
  }

  return parsed.data;
}

export async function loadRoleBundleFromFile(filePath: string): Promise<RoleBundle> {
  const source = await readFile(filePath, "utf8");
  const parsed = yaml.load(source);
  return validateRoleBundle(parsed);
}
