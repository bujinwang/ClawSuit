# ClawSuit

ClawSuit is an open-source, role-based AI assistant platform built on top of [OpenClaw](https://github.com/openclaw/openclaw). It enables non-technical users to activate professional AI assistants (Realtor, Recruiter, etc.) directly from their favorite messaging apps — no configuration required.

## How It Works

ClawSuit generates configuration files that OpenClaw reads to create fully-functional AI assistants. It never patches or forks OpenClaw — it simply writes markdown files to the config directory:

```
~/.openclaw/
├── AGENTS.md
├── SOUL.md
├── MEMORY.md
└── USER.md
```

## Quick Start

```bash
pnpm install
pnpm build
pnpm start
```

## Project Structure

```
clawsuit/
├── packages/
│   ├── core/          # Role compiler, context merger, intent router
│   ├── gateway/       # Messenger webhook handlers
│   ├── orchestrator/  # Per-user OpenClaw container management
│   ├── api/           # REST API (onboarding, billing, settings)
│   └── marketplace/   # Role bundle format + validator
├── roles/             # Role bundle definitions
├── infra/             # Infrastructure configurations
└── docs/              # Documentation
```

## Tech Stack

- **Runtime:** Node.js 25
- **Language:** TypeScript 5
- **Package Manager:** pnpm workspaces
- **Messaging:** WhatsApp Business API, Telegram Bot API, Slack Events API
- **Billing:** Stripe

## License

MIT
