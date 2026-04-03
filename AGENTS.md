# Repository Guidelines

## Project Structure & Module Organization
This repository currently contains a single source-of-truth design file: [`clawsuit-design.md`](/Users/admin/Documents/Projects/ClawSuit/clawsuit-design.md). Use it to guide implementation decisions, naming, and package boundaries.

The planned codebase is a `pnpm` TypeScript monorepo with `packages/core`, `packages/gateway`, `packages/orchestrator`, `packages/api`, and `packages/marketplace`, plus `roles/`, `infra/`, and `docs/`. Until that scaffold exists, keep new files grouped by those target paths so the repo grows toward the documented structure.

## Build, Test, and Development Commands
No runnable build or test toolchain is checked in yet. Before adding new automation, align it with the design doc’s target stack: Node.js 25, TypeScript 5, and `pnpm` workspaces.

Typical commands, once scaffolding is added:
- `pnpm install` - install workspace dependencies
- `pnpm build` - compile all packages
- `pnpm test` - run the test suite
- `pnpm lint` - enforce formatting and static checks

If you introduce a new command, document it in `README.md` and keep naming conventional.

## Coding Style & Naming Conventions
Follow the design doc’s TypeScript-first direction. Prefer strict TypeScript, 2-space indentation, and small modules with one clear responsibility. Use:

- `kebab-case` for folders and markdown files
- `camelCase` for variables and functions
- `PascalCase` for types, classes, and exported interfaces

Name files by responsibility, for example `fileWriter.ts`, `billing.ts`, or `morning-digest.yaml`.

## Testing Guidelines
There is no test framework configured yet. When adding implementation code, place tests beside the future package they cover or in package-local test folders such as `packages/api/src/**/*.test.ts`. Match test filenames to the unit under test, for example `validator.test.ts`.

Prioritize coverage for compiler behavior, role bundle validation, routing, and config-file generation.

## Commit & Pull Request Guidelines
Git history is not present in this workspace, so no repository-specific commit convention can be inferred. Use short, imperative commit subjects such as `Add realtor bundle validator`.

Pull requests should include:
- a brief summary of the change
- links to relevant issues or design sections
- sample commands or screenshots when behavior changes
- notes on any deviations from `clawsuit-design.md`

## Agent Notes
ClawSuit’s core contract is file generation, not patching OpenClaw. Keep contributions consistent with that boundary and document any change that expands the integration surface.
