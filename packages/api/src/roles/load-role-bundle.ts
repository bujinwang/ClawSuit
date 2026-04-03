import path from "node:path";

import { loadRoleBundleFromFile, type RoleBundle } from "@clawsuit/marketplace";

export async function loadRoleBundle(roleSlug: string, repoRoot = process.cwd()): Promise<RoleBundle> {
  const bundlePath = path.resolve(repoRoot, "roles", roleSlug, "bundle.yaml");
  return loadRoleBundleFromFile(bundlePath);
}
