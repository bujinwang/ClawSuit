import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadRoleBundleFromFile, RoleBundleValidationError, validateRoleBundle } from "./validator.js";

describe("validateRoleBundle", () => {
  it("loads and validates the realtor bundle", async () => {
    const bundlePath = path.resolve(process.cwd(), "../../roles/realtor/bundle.yaml");
    const bundle = await loadRoleBundleFromFile(bundlePath);

    expect(bundle.slug).toBe("realtor");
    expect(bundle.workflows).toHaveLength(5);
    expect(bundle.onboarding.questions[2]?.id).toBe("digest_time");
  });

  it("rejects invalid bundles with actionable errors", () => {
    expect(() =>
      validateRoleBundle({
        slug: "Realtor!",
        onboarding: { questions: [] },
        workflows: [],
        skills: []
      })
    ).toThrow(RoleBundleValidationError);
  });
});
