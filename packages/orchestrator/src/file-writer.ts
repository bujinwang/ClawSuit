import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CompilerOutput } from "@clawsuit/core";

export async function writeCompiledConfig(
  outputDir: string,
  files: CompilerOutput["files"]
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([filename, content]) =>
      writeFile(path.join(outputDir, filename), content, "utf8")
    )
  );
}
