import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadRoleBundleFromFile } from "@clawsuit/marketplace";

import { compileRole } from "./index.js";

const realtorBundlePath = path.resolve(process.cwd(), "../../roles/realtor/bundle.yaml");

describe("compileRole", () => {
  it("compiles the realtor role into the four OpenClaw files", async () => {
    const bundle = await loadRoleBundleFromFile(realtorBundlePath);
    const outputDir = await mkdtemp(path.join(tmpdir(), "clawsuit-compiler-"));

    const result = await compileRole({
      bundle,
      answers: {
        name_brokerage: "Alex Morgan, Northbank Realty",
        markets: "Edmonton, St. Albert",
        digest_time: "8:00 AM",
        tone: "Professional and direct",
        email: "alex@example.com"
      },
      user: {
        id: "user_123",
        phone: "+17805550123",
        name: "Alex Morgan",
        email: "alex@example.com"
      },
      outputDir
    });

    expect(Object.keys(result.files)).toEqual(["AGENTS.md", "SOUL.md", "MEMORY.md", "USER.md"]);
    expect(result.files["SOUL.md"]).toContain("Northbank Realty");
    expect(result.files["MEMORY.md"]).toContain("Edmonton, St. Albert");
    expect(result.files["USER.md"]).toContain("0 8 * * * run-workflow morning-digest");

    const writtenAgents = await readFile(path.join(outputDir, "AGENTS.md"), "utf8");
    expect(writtenAgents).toContain("Morning digest");
    expect(writtenAgents).toContain("schedule-showing");
  });
});
