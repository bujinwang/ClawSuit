# ClawSuit — Technical Design Document
**Version:** 0.1.0  
**Status:** Implementation-ready  
**Target runtime:** Node.js 25 + TypeScript 5  
**Primary implementor:** Codex  

---

## 1. Product Overview

ClawSuit is an open-source, role-based AI assistant platform that sits on top of OpenClaw. It lets non-technical users activate a professional role (Realtor, Recruiter, etc.) from their favourite messenger (WhatsApp, Telegram, Slack) and get a fully configured AI assistant with pre-wired daily workflows — no configuration required.

### 1.1 Core Principle

ClawSuit **only writes files**. It never patches or forks OpenClaw. The entire integration surface is four markdown files written to OpenClaw's config directory:

```
~/.openclaw/
├── AGENTS.md      ← ClawSuit writes this
├── SOUL.md        ← ClawSuit writes this
├── MEMORY.md      ← ClawSuit writes this
└── USER.md        ← ClawSuit writes this (includes cron schedules)
```

OpenClaw reads these files and runs normally. It never knows ClawSuit exists.

### 1.2 Phase 1 Scope (MVP)

- Realtor Suit only (Canada — Alberta/Edmonton focus)
- WhatsApp Business API channel
- Pillar 9 MLS + CREA DDF data sources
- Cloud-hosted OpenClaw instances (Docker, DigitalOcean)
- Stripe billing ($19/mo, 14-day free trial)
- GitHub open-source repo (MIT licence)

---

## 2. Repository Structure

```
clawsuit/
├── packages/
│   ├── core/                    # Role compiler, context merger, intent router
│   │   ├── src/
│   │   │   ├── compiler/        # Compiles role bundles → OpenClaw files
│   │   │   ├── merger/          # Multi-role context merging
│   │   │   ├── router/          # Intent detection and routing
│   │   │   └── scheduler/       # Cron management
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── gateway/                 # Messenger webhook handlers
│   │   ├── src/
│   │   │   ├── channels/
│   │   │   │   ├── whatsapp.ts  # WhatsApp Business API
│   │   │   │   ├── telegram.ts  # Telegram Bot API
│   │   │   │   └── slack.ts     # Slack Events API
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rateLimit.ts
│   │   │   │   └── transcribe.ts  # Voice note → text (Whisper)
│   │   │   └── server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── orchestrator/            # Per-user OpenClaw container management
│   │   ├── src/
│   │   │   ├── container.ts     # Docker container lifecycle
│   │   │   ├── fileWriter.ts    # Writes config files to container volumes
│   │   │   └── proxy.ts         # Routes messages to correct container
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                     # REST API (onboarding, billing, settings)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── onboarding.ts
│   │   │   │   ├── billing.ts
│   │   │   │   ├── roles.ts
│   │   │   │   └── credentials.ts
│   │   │   ├── middleware/
│   │   │   └── app.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── marketplace/             # Role bundle format + validator
│       ├── src/
│       │   ├── schema/          # Zod schemas for role bundle format
│       │   ├── validator.ts
│       │   └── registry.ts
│       ├── package.json
│       └── tsconfig.json
│
├── roles/                       # Role bundle definitions
│   └── realtor/
│       ├── bundle.yaml          # Role spec
│       ├── SOUL.md              # Role persona template
│       ├── AGENTS.md            # Agent/workflow template
│       ├── workflows/
│       │   ├── morning-digest.yaml
│       │   ├── schedule-showing.yaml
│       │   ├── draft-offer.yaml
│       │   ├── client-followup.yaml
│       │   └── cma-report.yaml
│       └── skills/
│           ├── mls-search.ts    # Pillar 9 / DDF API wrapper
│           └── calendar.ts      # Google Calendar / iCal
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.gateway
│   │   ├── Dockerfile.api
│   │   └── docker-compose.yml   # Full stack local dev
│   └── digitalocean/
│       └── app.yaml             # DO App Platform spec
│
├── docs/
│   ├── self-hosting.md
│   ├── role-bundle-spec.md      # How to build a new role
│   └── contributing.md
│
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── README.md
```

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 25 | Current release line; same ecosystem as OpenClaw |
| Language | TypeScript 5 strict | Type safety for config generation |
| Package manager | pnpm workspaces | Monorepo, fast |
| HTTP framework | Fastify 4 | Fast, schema-first, good TypeScript |
| Database | PostgreSQL 16 (via Supabase) | Users, roles, credentials, billing state |
| ORM | Drizzle | Lightweight, type-safe, no magic |
| Queue | BullMQ + Redis | Cron jobs, async workflow execution |
| Container orchestration | Docker Compose (dev) → DigitalOcean App Platform (prod) | Simple, proven for OpenClaw |
| WhatsApp | Meta Cloud API (official) | Required for proactive messages |
| Telegram | grammy.js | Best TypeScript Telegram bot library |
| Voice transcription | OpenAI Whisper API | Voice note → text |
| Billing | Stripe | Industry standard |
| MLS data | Pillar 9 RESO Web API + CREA DDF | Alberta + national coverage |
| Secrets | Vault (prod) / .env (dev) | Encrypted credential storage |
| Monitoring | Better Stack (logs + uptime) | Simple, affordable |
| CI/CD | GitHub Actions | Native to repo |

---

## 4. Data Models

### 4.1 Database Schema (PostgreSQL / Drizzle)

```typescript
// packages/api/src/db/schema.ts

import { pgTable, uuid, text, timestamp, boolean, 
         jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

export const channelEnum = pgEnum('channel', 
  ['whatsapp', 'telegram', 'slack', 'email']);

export const roleStatusEnum = pgEnum('role_status', 
  ['onboarding', 'active', 'paused', 'cancelled']);

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  phone:        text('phone').unique(),           // WhatsApp/Telegram number
  email:        text('email'),
  name:         text('name'),
  createdAt:    timestamp('created_at').defaultNow(),
  stripeCustomerId: text('stripe_customer_id'),
  trialEndsAt:  timestamp('trial_ends_at'),
  activeRoleId: uuid('active_role_id'),          // FK to user_roles
});

export const userRoles = pgTable('user_roles', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id),
  roleSlug:     text('role_slug').notNull(),      // 'realtor', 'recruiter', etc.
  status:       roleStatusEnum('status').default('onboarding'),
  config:       jsonb('config').notNull(),        // Onboarding answers
  compiledAt:   timestamp('compiled_at'),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const openclawInstances = pgTable('openclaw_instances', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id).unique(),
  containerId:  text('container_id'),             // Docker container ID
  containerHost:text('container_host'),           // Droplet IP or hostname
  port:         integer('port'),                  // Internal port
  status:       text('status').default('provisioning'),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const credentials = pgTable('credentials', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id),
  service:      text('service').notNull(),        // 'pillar9', 'google_calendar', etc.
  encryptedData:text('encrypted_data').notNull(), // AES-256-GCM encrypted JSON
  createdAt:    timestamp('created_at').defaultNow(),
  expiresAt:    timestamp('expires_at'),
});

export const onboardingSessions = pgTable('onboarding_sessions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id),
  roleSlug:     text('role_slug').notNull(),
  step:         integer('step').default(0),
  answers:      jsonb('answers').default({}),
  completedAt:  timestamp('completed_at'),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const messageLog = pgTable('message_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id),
  channel:      channelEnum('channel'),
  direction:    text('direction'),                // 'inbound' | 'outbound'
  content:      text('content'),
  metadata:     jsonb('metadata'),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const billingSubscriptions = pgTable('billing_subscriptions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').references(() => users.id),
  stripeSubId:      text('stripe_sub_id').unique(),
  stripePriceId:    text('stripe_price_id'),
  status:           text('status'),               // Stripe subscription status
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd:boolean('cancel_at_period_end').default(false),
  createdAt:        timestamp('created_at').defaultNow(),
});
```

---

## 5. Role Bundle Format

Every role is a YAML spec. This is the contract the community follows to build new roles.

### 5.1 Spec (Zod schema + example)

```typescript
// packages/marketplace/src/schema/roleBundle.ts

import { z } from 'zod';

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['cron', 'intent', 'event']),
  value: z.string(),   // cron: '0 7 * * *' | intent: regex | event: 'message_received'
});

export const WorkflowStepSchema = z.object({
  id:     z.string(),
  skill:  z.string(),   // skill ID from skills registry
  input:  z.record(z.string()),  // template strings with {{variable}} interpolation
  output: z.string().optional(), // variable name to store result
});

export const WorkflowSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  description: z.string(),
  trigger:     WorkflowTriggerSchema,
  steps:       z.array(WorkflowStepSchema),
  outputFormat:z.string().optional(), // WhatsApp template ID or 'freeform'
});

export const RoleBundleSchema = z.object({
  slug:        z.string().regex(/^[a-z-]+$/),
  version:     z.string(),
  name:        z.string(),
  description: z.string(),
  price:       z.object({
    monthly:   z.number(),
    currency:  z.string().default('CAD'),
  }),
  
  onboarding: z.object({
    questions: z.array(z.object({
      id:       z.string(),
      text:     z.string(),
      type:     z.enum(['text', 'choice', 'time', 'email']),
      choices:  z.array(z.string()).optional(),
      required: z.boolean().default(true),
    })),
  }),

  skills:    z.array(z.string()),      // Skill slugs required
  workflows: z.array(WorkflowSchema),
  
  soul: z.object({
    persona:    z.string(),            // Markdown - injected into SOUL.md
    tone:       z.string(),
    boundaries: z.array(z.string()),   // Things this role never does
  }),

  channels: z.object({
    primary:   z.enum(['whatsapp', 'telegram', 'slack', 'email']),
    fallback:  z.enum(['whatsapp', 'telegram', 'slack', 'email']).optional(),
  }),

  dataConnections: z.array(z.object({
    service:   z.string(),             // 'pillar9', 'google_calendar', etc.
    required:  z.boolean(),
    setupUrl:  z.string().url(),       // Secure credential setup page
  })),
});

export type RoleBundle = z.infer<typeof RoleBundleSchema>;
```

### 5.2 Realtor Bundle (roles/realtor/bundle.yaml)

```yaml
slug: realtor
version: 1.0.0
name: Realtor Suit
description: Daily AI assistant for Canadian real estate agents
price:
  monthly: 19
  currency: CAD

onboarding:
  questions:
    - id: name_brokerage
      text: "What's your name and brokerage?"
      type: text
      required: true
    - id: markets
      text: "Which markets do you cover? (e.g. Edmonton, St. Albert)"
      type: text
      required: true
    - id: digest_time
      text: "What time should I send your morning digest?"
      type: choice
      choices: ["6:00 AM", "7:00 AM", "8:00 AM", "Custom"]
      required: true
    - id: tone
      text: "How should I write client messages for you?"
      type: choice
      choices: ["Warm and friendly", "Professional and direct", "Casual"]
      required: true
    - id: email
      text: "Your email address (for CMA reports and DocuSign links)"
      type: email
      required: false

skills:
  - mls-search
  - google-calendar
  - email-smtp
  - pdf-generator
  - web-search

workflows:
  - id: morning-digest
    name: Morning digest
    description: Daily listing digest with new listings and price drops
    trigger:
      type: cron
      value: "0 7 * * *"   # Overridden by digest_time answer at compile time
    steps:
      - id: search-new-listings
        skill: mls-search
        input:
          markets: "{{onboarding.markets}}"
          filter: new_last_24h
          limit: "10"
        output: newListings
      - id: search-price-drops
        skill: mls-search
        input:
          markets: "{{onboarding.markets}}"
          filter: price_reduced_last_24h
          limit: "5"
        output: priceDrops
      - id: get-calendar
        skill: google-calendar
        input:
          date: today
          lookahead_hours: "24"
        output: todaySchedule
      - id: format-digest
        skill: llm-format
        input:
          template: realtor-morning-digest
          newListings: "{{newListings}}"
          priceDrops: "{{priceDrops}}"
          schedule: "{{todaySchedule}}"
          agentName: "{{onboarding.name_brokerage}}"
        output: digest
      - id: send
        skill: whatsapp-send
        input:
          to: "{{user.phone}}"
          templateId: realtor_morning_digest_v1
          variables:
            "1": "{{onboarding.name_brokerage.firstName}}"
            "2": "{{digest.summary}}"
            "3": "{{digest.newListings}}"
            "4": "{{digest.priceDrops}}"
            "5": "{{digest.todaySchedule}}"

  - id: schedule-showing
    name: Schedule showing
    description: Create a showing from natural language request
    trigger:
      type: intent
      value: "schedule|book|arrange.*(showing|viewing|visit)"
    steps:
      - id: extract-details
        skill: llm-extract
        input:
          text: "{{message.text}}"
          schema: ShowingRequest
        output: showing
      - id: check-calendar
        skill: google-calendar
        input:
          action: check_availability
          datetime: "{{showing.datetime}}"
        output: available
      - id: create-event
        skill: google-calendar
        input:
          action: create_event
          title: "Showing — {{showing.address}}"
          datetime: "{{showing.datetime}}"
          attendees: "{{showing.clientEmail}}"
        output: event
      - id: draft-confirmation
        skill: llm-format
        input:
          template: showing-confirmation
          showing: "{{showing}}"
          tone: "{{onboarding.tone}}"
        output: confirmationText
      - id: reply
        skill: whatsapp-reply
        input:
          text: "{{confirmationText}}"

  - id: draft-offer
    name: Draft offer
    description: Pull comps and draft an offer letter
    trigger:
      type: intent
      value: "draft|write|prepare.*(offer|purchase)"
    steps:
      - id: extract-address
        skill: llm-extract
        input:
          text: "{{message.text}}"
          schema: OfferRequest
        output: offer
      - id: pull-comps
        skill: mls-search
        input:
          address: "{{offer.address}}"
          filter: sold_last_90d
          radius_km: "1"
          limit: "5"
        output: comps
      - id: draft
        skill: llm-format
        input:
          template: offer-letter
          offer: "{{offer}}"
          comps: "{{comps}}"
          agentName: "{{onboarding.name_brokerage}}"
        output: draftText
      - id: reply
        skill: whatsapp-reply
        input:
          text: "{{draftText}}"
          attachPdf: true

  - id: client-followup
    name: Client follow-up
    description: Draft a personalised client follow-up message
    trigger:
      type: intent
      value: "follow.?up|check in|touch base.*(client|buyer|seller)"
    steps:
      - id: extract-context
        skill: llm-extract
        input:
          text: "{{message.text}}"
          schema: FollowUpRequest
        output: request
      - id: draft
        skill: llm-format
        input:
          template: client-followup
          request: "{{request}}"
          tone: "{{onboarding.tone}}"
          agentName: "{{onboarding.name_brokerage}}"
        output: followupText
      - id: reply
        skill: whatsapp-reply
        input:
          text: "{{followupText}}"

  - id: cma-report
    name: CMA report
    description: Generate a PDF comparative market analysis
    trigger:
      type: intent
      value: "CMA|comparative market|market analysis"
    steps:
      - id: extract-address
        skill: llm-extract
        input:
          text: "{{message.text}}"
          schema: CMARequest
        output: cma
      - id: pull-actives
        skill: mls-search
        input:
          address: "{{cma.address}}"
          filter: active
          radius_km: "1"
        output: actives
      - id: pull-solds
        skill: mls-search
        input:
          address: "{{cma.address}}"
          filter: sold_last_180d
          radius_km: "1"
        output: solds
      - id: generate-pdf
        skill: pdf-generator
        input:
          template: cma-report
          address: "{{cma.address}}"
          actives: "{{actives}}"
          solds: "{{solds}}"
          agentName: "{{onboarding.name_brokerage}}"
        output: pdfPath
      - id: email-pdf
        skill: email-smtp
        input:
          to: "{{onboarding.email}}"
          subject: "CMA Report — {{cma.address}}"
          attachment: "{{pdfPath}}"
      - id: reply
        skill: whatsapp-reply
        input:
          text: "CMA report for {{cma.address}} has been sent to {{onboarding.email}}"

soul:
  persona: |
    You are a highly competent, licensed real estate professional assistant serving 
    {{onboarding.name_brokerage}}. You know the Canadian real estate market deeply, 
    understand REBBA compliance requirements, and write in a {{onboarding.tone}} tone.
    You never give investment advice. You always recommend clients consult their own 
    legal counsel before signing. You format all dollar amounts in CAD.
  tone: "{{onboarding.tone}}"
  boundaries:
    - Never provide investment advice or return on investment projections
    - Never write offers without confirming with the agent first
    - Never share one client's information with another
    - Always recommend legal review before signing

channels:
  primary: whatsapp
  fallback: email

dataConnections:
  - service: pillar9
    required: true
    setupUrl: https://clawsuit.io/connect/pillar9
  - service: google_calendar
    required: false
    setupUrl: https://clawsuit.io/connect/google-calendar
```

---

## 6. Role Compiler

The compiler is the heart of ClawSuit. It takes a role bundle + onboarding answers and generates the four OpenClaw config files.

### 6.1 Compiler Interface

```typescript
// packages/core/src/compiler/index.ts

export interface CompilerInput {
  bundle:    RoleBundle;
  answers:   Record<string, string>;   // Onboarding answers keyed by question.id
  user:      { id: string; phone: string; email?: string; name?: string };
  outputDir: string;                   // Path to OpenClaw config volume
}

export interface CompilerOutput {
  files: {
    'AGENTS.md': string;
    'SOUL.md':   string;
    'MEMORY.md': string;
    'USER.md':   string;
  };
  compiledAt: Date;
}

export async function compileRole(input: CompilerInput): Promise<CompilerOutput>
```

### 6.2 Compiler Implementation

```typescript
// packages/core/src/compiler/index.ts

import Mustache from 'mustache';
import yaml from 'js-yaml';
import { RoleBundle, CompilerInput, CompilerOutput } from '../types';

export async function compileRole(input: CompilerInput): Promise<CompilerOutput> {
  const { bundle, answers, user } = input;

  const ctx = buildContext(bundle, answers, user);

  const files = {
    'AGENTS.md': compileAgentsMd(bundle, ctx),
    'SOUL.md':   compileSoulMd(bundle, ctx),
    'MEMORY.md': compileMemoryMd(bundle, ctx),
    'USER.md':   compileUserMd(bundle, ctx),
  };

  // Write files to OpenClaw config directory
  for (const [filename, content] of Object.entries(files)) {
    await fs.writeFile(path.join(input.outputDir, filename), content, 'utf-8');
  }

  return { files, compiledAt: new Date() };
}

function buildContext(bundle: RoleBundle, answers: Record<string, string>, user: any) {
  return {
    role:       bundle,
    onboarding: answers,
    user,
    // Derived values
    firstName:  answers.name_brokerage?.split(',')[0]?.trim() ?? user.name,
    markets:    answers.markets?.split(',').map(m => m.trim()) ?? [],
    digestTime: parseTime(answers.digest_time ?? '7:00 AM'),
    tone:       answers.tone ?? 'Professional and direct',
  };
}

function compileAgentsMd(bundle: RoleBundle, ctx: any): string {
  const lines: string[] = [
    `# ClawSuit — ${bundle.name}`,
    `<!-- Generated by ClawSuit compiler v${bundle.version} -->`,
    `<!-- Role: ${bundle.slug} | Compiled: ${new Date().toISOString()} -->`,
    '',
    '## Active role',
    `**${bundle.name}** — ${bundle.description}`,
    '',
    '## Skills',
    ...bundle.skills.map(s => `- ${s}`),
    '',
    '## Workflows',
  ];

  for (const workflow of bundle.workflows) {
    lines.push('');
    lines.push(`### ${workflow.name}`);
    lines.push(`**Trigger:** ${formatTrigger(workflow.trigger, ctx)}`);
    lines.push(`**Description:** ${workflow.description}`);
    lines.push('');
    lines.push('**Steps:**');
    for (const step of workflow.steps) {
      lines.push(`${step.id}. Run skill \`${step.skill}\``);
    }
  }

  return lines.join('\n');
}

function compileSoulMd(bundle: RoleBundle, ctx: any): string {
  const persona = Mustache.render(bundle.soul.persona, ctx);
  return [
    '# Soul',
    '',
    '## Identity',
    persona,
    '',
    '## Tone',
    ctx.tone,
    '',
    '## Boundaries',
    ...bundle.soul.boundaries.map(b => `- ${b}`),
    '',
    '## Active role context',
    `You are currently acting as **${bundle.name}**. `,
    `Always respond in character as a ${bundle.name} assistant.`,
    `Apply all ${bundle.name} workflows when the user's intent matches.`,
  ].join('\n');
}

function compileMemoryMd(bundle: RoleBundle, ctx: any): string {
  return [
    '# Memory',
    '',
    '## User profile',
    `- Name: ${ctx.firstName}`,
    `- Role: ${bundle.name}`,
    answers.name_brokerage ? `- Brokerage: ${ctx.onboarding.name_brokerage}` : '',
    `- Markets: ${ctx.markets.join(', ')}`,
    ctx.onboarding.email ? `- Email: ${ctx.onboarding.email}` : '',
    `- Preferred tone: ${ctx.tone}`,
    `- Preferred channel: ${bundle.channels.primary}`,
    '',
    '## Preferences',
    `- Digest time: ${ctx.onboarding.digest_time}`,
    `- Language: en-CA`,
    `- Currency: CAD`,
    '',
    '## Data connections',
    ...bundle.dataConnections.map(dc => 
      `- ${dc.service}: ${dc.required ? 'required' : 'optional'}`
    ),
  ].filter(Boolean).join('\n');
}

function compileUserMd(bundle: RoleBundle, ctx: any): string {
  const cronSchedules = bundle.workflows
    .filter(w => w.trigger.type === 'cron')
    .map(w => {
      const cron = resolveCron(w.trigger.value, ctx);
      return `${cron} run-workflow ${w.id}`;
    });

  return [
    '# User configuration',
    '',
    '## Scheduled workflows',
    '```',
    ...cronSchedules,
    '```',
    '',
    '## Messenger channel',
    `primary: ${bundle.channels.primary}`,
    bundle.channels.fallback ? `fallback: ${bundle.channels.fallback}` : '',
    '',
    '## LLM preferences',
    'default_model: claude-haiku-4-5-20251001',
    'complex_model: claude-sonnet-4-6',
    'max_tokens_per_workflow: 4000',
  ].filter(Boolean).join('\n');
}

function resolveCron(template: string, ctx: any): string {
  // Replace digest_time answer into cron expression
  if (template === '0 7 * * *' && ctx.digestTime) {
    return `0 ${ctx.digestTime.hour} * * *`;
  }
  return template;
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return { hour: 7, minute: 0 };
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  if (match[3]?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  return { hour, minute };
}
```

---

## 7. WhatsApp Gateway

### 7.1 Incoming Message Handler

```typescript
// packages/gateway/src/channels/whatsapp.ts

import Fastify from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { intentRouter } from '../router';
import { transcribeAudio } from '../middleware/transcribe';

export function registerWhatsAppRoutes(app: ReturnType<typeof Fastify>) {
  
  // Webhook verification (Meta requires GET)
  app.get('/webhook/whatsapp', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 
            'hub.challenge': challenge } = req.query as any;
    if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.status(403).send('Forbidden');
  });

  // Incoming messages
  app.post('/webhook/whatsapp', {
    preHandler: verifyWhatsAppSignature,
  }, async (req, reply) => {
    const body = req.body as WhatsAppWebhookPayload;
    
    // Acknowledge immediately (Meta requires 200 within 20s)
    reply.status(200).send('OK');

    // Process async
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];
        for (const message of messages) {
          await processIncomingMessage(message, change.value.metadata);
        }
      }
    }
  });
}

async function processIncomingMessage(
  message: WhatsAppMessage, 
  metadata: { phone_number_id: string }
) {
  const fromPhone = message.from;
  
  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.phone, fromPhone)
  });

  // Extract text content
  let text: string | null = null;

  if (message.type === 'text') {
    text = message.text?.body ?? null;
  } else if (message.type === 'audio') {
    // Download voice note and transcribe
    const audioUrl = await getMediaUrl(message.audio!.id);
    text = await transcribeAudio(audioUrl);
  } else if (message.type === 'interactive') {
    // Button reply
    text = message.interactive?.button_reply?.title ?? 
           message.interactive?.list_reply?.title ?? null;
  }

  if (!text) return;

  // New user — start onboarding
  if (!user) {
    user = await createUser(fromPhone);
    await startOnboarding(user, 'whatsapp', text);
    return;
  }

  // Check if in onboarding
  const session = await getActiveOnboardingSession(user.id);
  if (session) {
    await handleOnboardingStep(user, session, text);
    return;
  }

  // Route to active role workflow
  const activeRole = await getUserActiveRole(user.id);
  if (!activeRole) {
    await sendWhatsAppMessage(fromPhone, 
      "You don't have an active role yet. Send 'Hi' to get started.");
    return;
  }

  await intentRouter.route({ user, role: activeRole, text, channel: 'whatsapp' });
}

async function verifyWhatsAppSignature(req: any, reply: any) {
  const signature = req.headers['x-hub-signature-256'] as string;
  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.WA_APP_SECRET!)
    .update(JSON.stringify(req.body))
    .digest('hex')}`;
  if (signature !== expected) {
    return reply.status(401).send('Unauthorized');
  }
}
```

### 7.2 Outbound Message Sender

```typescript
// packages/gateway/src/channels/whatsapp-send.ts

const WA_API_BASE = 'https://graph.facebook.com/v20.0';

export async function sendWhatsAppMessage(
  to: string, 
  text: string
): Promise<void> {
  await fetch(`${WA_API_BASE}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: string[]
): Promise<void> {
  await fetch(`${WA_API_BASE}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_CA' },
        components: [{
          type: 'body',
          parameters: variables.map(v => ({ type: 'text', text: v })),
        }],
      },
    }),
  });
}

export async function sendWhatsAppInteractive(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  await fetch(`${WA_API_BASE}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) }, // WA 20-char limit
          })),
        },
      },
    }),
  });
}
```

---

## 8. Onboarding Flow Engine

```typescript
// packages/api/src/routes/onboarding.ts

export class OnboardingEngine {
  
  async start(userId: string, roleSlug: string, channel: string): Promise<void> {
    const bundle = await loadRoleBundle(roleSlug);
    
    // Create onboarding session
    const session = await db.insert(onboardingSessions).values({
      userId,
      roleSlug,
      step: 0,
      answers: {},
    }).returning();

    await this.sendQuestion(userId, bundle, 0, channel);
  }

  async handleAnswer(
    userId: string, 
    sessionId: string, 
    answer: string
  ): Promise<void> {
    const session = await db.query.onboardingSessions.findFirst({
      where: eq(onboardingSessions.id, sessionId)
    });
    
    const bundle = await loadRoleBundle(session!.roleSlug);
    const question = bundle.onboarding.questions[session!.step];

    // Save answer
    const answers = { 
      ...(session!.answers as Record<string, string>), 
      [question.id]: answer 
    };
    
    const nextStep = session!.step + 1;
    const isComplete = nextStep >= bundle.onboarding.questions.length;

    await db.update(onboardingSessions)
      .set({ step: nextStep, answers, completedAt: isComplete ? new Date() : null })
      .where(eq(onboardingSessions.id, sessionId));

    if (isComplete) {
      await this.completeOnboarding(userId, session!.roleSlug, answers);
    } else {
      await this.sendQuestion(userId, bundle, nextStep, 'whatsapp');
    }
  }

  private async completeOnboarding(
    userId: string, 
    roleSlug: string, 
    answers: Record<string, string>
  ): Promise<void> {
    const user = await db.query.users.findFirst({ 
      where: eq(users.id, userId) 
    });
    const bundle = await loadRoleBundle(roleSlug);

    // 1. Create user role record
    const [userRole] = await db.insert(userRoles).values({
      userId, roleSlug, status: 'active', config: answers,
    }).returning();

    // 2. Provision OpenClaw container
    const instance = await containerManager.provision(userId);

    // 3. Compile and write OpenClaw config files
    await compileRole({
      bundle,
      answers,
      user: { id: user!.id, phone: user!.phone!, email: user!.email ?? undefined },
      outputDir: instance.configVolumePath,
    });

    // 4. Start trial subscription in Stripe
    await billing.startTrial(userId, bundle.slug);

    // 5. Send completion message
    const firstName = answers.name_brokerage?.split(',')[0]?.trim() ?? 'there';
    await sendWhatsAppInteractive(
      user!.phone!,
      `🎉 *You're live, ${firstName}!*\n\nYour ${bundle.name} is configured and ready.\nTomorrow at ${answers.digest_time} you'll get your first digest. Try me now:`,
      [
        { id: 'search_listings',    title: 'Search listings' },
        { id: 'schedule_showing',   title: 'Schedule a showing' },
        { id: 'draft_followup',     title: 'Draft a follow-up' },
      ]
    );
  }

  private async sendQuestion(
    userId: string,
    bundle: RoleBundle,
    stepIndex: number,
    channel: string
  ): Promise<void> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const question = bundle.onboarding.questions[stepIndex];
    const progress = `*${stepIndex + 1} of ${bundle.onboarding.questions.length}* — `;

    if (question.type === 'choice' && question.choices) {
      await sendWhatsAppInteractive(
        user!.phone!,
        progress + question.text,
        question.choices.slice(0, 3).map((c, i) => ({ id: `choice_${i}`, title: c }))
      );
    } else {
      await sendWhatsAppMessage(user!.phone!, progress + question.text);
    }
  }
}
```

---

## 9. OpenClaw Container Manager

```typescript
// packages/orchestrator/src/container.ts

import Docker from 'dockerode';
import path from 'path';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const OPENCLAW_IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const BASE_CONFIG_DIR = process.env.OPENCLAW_DATA_DIR ?? '/data/openclaw';
const BASE_PORT = 13000;

export interface ContainerInstance {
  containerId:      string;
  userId:           string;
  port:             number;
  configVolumePath: string;
  status:           'running' | 'stopped' | 'error';
}

export async function provisionContainer(userId: string): Promise<ContainerInstance> {
  const port = await allocatePort();
  const configDir = path.join(BASE_CONFIG_DIR, userId);
  
  // Create config directory
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(path.join(configDir, 'workspace'), { recursive: true });

  const container = await docker.createContainer({
    Image: OPENCLAW_IMAGE,
    name: `clawsuit-${userId.slice(0, 8)}`,
    Env: [
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      `OPENCLAW_CONFIG_DIR=/home/node/.openclaw`,
      `GATEWAY_TOKEN=${generateToken()}`,
      `PORT=3000`,
      // Disable WhatsApp pairing — ClawSuit handles the channel
      `OPENCLAW_CHANNEL=none`,
    ],
    HostConfig: {
      Binds: [
        `${configDir}:/home/node/.openclaw`,
        `${configDir}/workspace:/home/node/.openclaw/workspace`,
      ],
      PortBindings: {
        '3000/tcp': [{ HostPort: port.toString() }],
      },
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 512 * 1024 * 1024,    // 512MB per instance
      NanoCPUs: 500_000_000,        // 0.5 vCPU
    },
  });

  await container.start();

  // Save to database
  await db.insert(openclawInstances).values({
    userId,
    containerId: container.id,
    containerHost: 'localhost',
    port,
    status: 'running',
  });

  return {
    containerId:      container.id,
    userId,
    port,
    configVolumePath: configDir,
    status:           'running',
  };
}

export async function sendToContainer(
  userId: string, 
  message: string
): Promise<string> {
  const instance = await db.query.openclawInstances.findFirst({
    where: eq(openclawInstances.userId, userId)
  });
  
  if (!instance) throw new Error(`No container for user ${userId}`);

  const response = await fetch(`http://localhost:${instance.port}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, channel: 'api' }),
  });

  const data = await response.json() as { reply: string };
  return data.reply;
}

async function allocatePort(): Promise<number> {
  const existingInstances = await db.query.openclawInstances.findMany();
  const usedPorts = new Set(existingInstances.map(i => i.port));
  let port = BASE_PORT;
  while (usedPorts.has(port)) port++;
  return port;
}
```

---

## 10. MLS Data Skills

### 10.1 Pillar 9 RESO API Skill

```typescript
// roles/realtor/skills/mls-search.ts

interface MLSSearchParams {
  markets:     string | string[];
  filter:      'active' | 'new_last_24h' | 'price_reduced_last_24h' | 
               'sold_last_90d' | 'sold_last_180d';
  limit?:      number;
  address?:    string;
  radius_km?:  number;
}

interface MLSListing {
  mlsNumber:    string;
  address:      string;
  price:        number;
  previousPrice?: number;
  bedrooms:     number;
  bathrooms:    number;
  sqft:         number;
  daysOnMarket: number;
  status:       string;
  listingDate:  string;
  photos:       string[];
  description:  string;
  agentName:    string;
  brokerage:    string;
}

export class Pillar9Skill {
  private baseUrl = 'https://query.ampre.ca/odata';

  constructor(
    private readonly userId: string,
    private readonly credentialStore: CredentialStore,
  ) {}

  async search(params: MLSSearchParams): Promise<MLSListing[]> {
    const token = await this.getAccessToken();
    const filter = this.buildODataFilter(params);

    const response = await fetch(
      `${this.baseUrl}/Property?$filter=${encodeURIComponent(filter)}&$top=${params.limit ?? 20}&$select=ListingKey,UnparsedAddress,ListPrice,BedsTotal,BathroomsTotalInteger,LivingArea,DaysOnMarket,StandardStatus,ListingContractDate,ModificationTimestamp`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      }
    );

    const data = await response.json() as { value: any[] };
    return data.value.map(this.mapListing);
  }

  private buildODataFilter(params: MLSSearchParams): string {
    const filters: string[] = ['StandardStatus eq \'Active\''];
    
    const markets = Array.isArray(params.markets) 
      ? params.markets 
      : [params.markets];
    
    const cityFilter = markets
      .map(m => `City eq '${m.trim()}'`)
      .join(' or ');
    filters.push(`(${cityFilter})`);

    switch (params.filter) {
      case 'new_last_24h':
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        filters.push(`ListingContractDate ge ${yesterday}`);
        break;
      case 'price_reduced_last_24h':
        filters.push(`PriceChangeTimestamp ge ${new Date(Date.now() - 86400000).toISOString()}`);
        break;
      case 'sold_last_90d':
        filters.push(`StandardStatus eq 'Closed'`);
        filters.push(`CloseDate ge ${new Date(Date.now() - 90 * 86400000).toISOString()}`);
        filters.splice(0, 1); // Remove 'Active' filter
        break;
    }

    return filters.join(' and ');
  }

  private async getAccessToken(): Promise<string> {
    const creds = await this.credentialStore.get(this.userId, 'pillar9');
    // Token refresh logic here
    return creds.accessToken;
  }

  private mapListing(raw: any): MLSListing {
    return {
      mlsNumber:    raw.ListingKey,
      address:      raw.UnparsedAddress,
      price:        raw.ListPrice,
      bedrooms:     raw.BedsTotal,
      bathrooms:    raw.BathroomsTotalInteger,
      sqft:         raw.LivingArea,
      daysOnMarket: raw.DaysOnMarket,
      status:       raw.StandardStatus,
      listingDate:  raw.ListingContractDate,
      photos:       [],
      description:  '',
      agentName:    '',
      brokerage:    '',
    };
  }
}
```

---

## 11. Credential Management

Credentials are never stored in plaintext. They are AES-256-GCM encrypted before hitting the database.

```typescript
// packages/api/src/credentials.ts

import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY!, 'hex');
// CREDENTIAL_ENCRYPTION_KEY must be 64 hex chars (32 bytes)

export interface StoredCredential {
  service: string;
  data:    Record<string, string>;
}

export async function encryptCredential(data: Record<string, string>): Promise<string> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Format: iv(12) + tag(16) + encrypted
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export async function decryptCredential(encryptedBase64: string): Promise<Record<string, string>> {
  const buf = Buffer.from(encryptedBase64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const encrypted = buf.slice(28);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// One-time secure credential setup link
export async function generateCredentialSetupLink(
  userId: string, 
  service: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  
  // Store token with 15-minute expiry
  await redis.setex(`cred_setup:${token}`, 900, JSON.stringify({ userId, service }));
  
  return `https://clawsuit.io/connect/${service}?token=${token}`;
}

// Called when user submits credentials on the secure web page
export async function saveCredential(
  token: string, 
  credentialData: Record<string, string>
): Promise<void> {
  const stored = await redis.get(`cred_setup:${token}`);
  if (!stored) throw new Error('Invalid or expired token');
  
  const { userId, service } = JSON.parse(stored);
  const encrypted = await encryptCredential(credentialData);
  
  await db.insert(credentials).values({ userId, service, encryptedData: encrypted })
    .onConflictDoUpdate({
      target: [credentials.userId, credentials.service],
      set:    { encryptedData: encrypted },
    });
  
  await redis.del(`cred_setup:${token}`);
}
```

---

## 12. Intent Router

```typescript
// packages/core/src/router/index.ts

interface RouterInput {
  user:    { id: string; phone: string };
  role:    { roleSlug: string; config: Record<string, string> };
  text:    string;
  channel: 'whatsapp' | 'telegram' | 'slack';
}

export class IntentRouter {
  
  async route(input: RouterInput): Promise<void> {
    const bundle = await loadRoleBundle(input.role.roleSlug);
    
    // Try to match a workflow trigger
    const matchedWorkflow = bundle.workflows
      .filter(w => w.trigger.type === 'intent')
      .find(w => {
        const pattern = new RegExp(w.trigger.value, 'i');
        return pattern.test(input.text);
      });

    if (matchedWorkflow) {
      await this.executeWorkflow(matchedWorkflow, input);
      return;
    }

    // No workflow matched — pass to OpenClaw as freeform conversation
    const response = await containerProxy.sendMessage(input.user.id, input.text);
    await this.sendResponse(input, response);
  }

  private async executeWorkflow(workflow: Workflow, input: RouterInput): Promise<void> {
    const context: Record<string, any> = {
      message:    { text: input.text },
      user:       input.user,
      onboarding: input.role.config,
    };

    for (const step of workflow.steps) {
      const skill = await loadSkill(step.skill, input.user.id);
      const resolvedInput = resolveTemplates(step.input, context);
      const result = await skill.execute(resolvedInput);
      
      if (step.output) {
        context[step.output] = result;
      }
    }
  }

  private resolveTemplates(
    input: Record<string, string>, 
    context: Record<string, any>
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [
        k,
        v.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
          return path.split('.').reduce((obj: any, key: string) => obj?.[key], context) ?? '';
        })
      ])
    );
  }

  private async sendResponse(input: RouterInput, text: string): Promise<void> {
    if (input.channel === 'whatsapp') {
      await sendWhatsAppMessage(input.user.phone, text);
    }
    // Add telegram, slack here
  }
}
```

---

## 13. Billing (Stripe)

```typescript
// packages/api/src/billing.ts

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs — create these in Stripe dashboard
const PRICE_IDS: Record<string, string> = {
  realtor:   process.env.STRIPE_PRICE_REALTOR!,    // $19/mo CAD
  recruiter: process.env.STRIPE_PRICE_RECRUITER!,  // $29/mo CAD
};

export async function startTrial(userId: string, roleSlug: string): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  
  // Create Stripe customer if needed
  let stripeCustomerId = user!.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      metadata: { clawsuitUserId: userId },
      phone:    user!.phone ?? undefined,
      email:    user!.email ?? undefined,
    });
    stripeCustomerId = customer.id;
    await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
  }

  // Create subscription with 14-day trial (no card required)
  const subscription = await stripe.subscriptions.create({
    customer:           stripeCustomerId,
    items:              [{ price: PRICE_IDS[roleSlug] }],
    trial_period_days:  14,
    payment_settings:   { save_default_payment_method: 'on_subscription' },
    trial_settings: {
      end_behavior: { missing_payment_method: 'pause' }  // Pause, don't cancel
    },
  });

  await db.insert(billingSubscriptions).values({
    userId,
    stripeSubId:      subscription.id,
    stripePriceId:    PRICE_IDS[roleSlug],
    status:           subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });

  // Set trial end in users table
  await db.update(users)
    .set({ trialEndsAt: new Date(Date.now() + 14 * 86400000) })
    .where(eq(users.id, userId));
}

// Stripe webhook handler
export async function handleStripeWebhook(rawBody: Buffer, signature: string) {
  const event = stripe.webhooks.constructEvent(
    rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db.update(billingSubscriptions)
        .set({ 
          status:           sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        })
        .where(eq(billingSubscriptions.stripeSubId, sub.id));
      
      // Pause/resume OpenClaw container based on subscription status
      if (sub.status === 'paused' || sub.status === 'canceled') {
        const billing = await db.query.billingSubscriptions.findFirst({
          where: eq(billingSubscriptions.stripeSubId, sub.id)
        });
        await containerManager.pause(billing!.userId);
      }
      break;
    }
    
    case 'customer.subscription.trial_will_end': {
      // Send reminder 3 days before trial ends
      const sub = event.data.object as Stripe.Subscription;
      const billing = await db.query.billingSubscriptions.findFirst({
        where: eq(billingSubscriptions.stripeSubId, sub.id)
      });
      const user = await db.query.users.findFirst({
        where: eq(users.id, billing!.userId)
      });
      const trialEnd = new Date(sub.trial_end! * 1000).toLocaleDateString('en-CA');
      await sendWhatsAppMessage(
        user!.phone!,
        `Your ClawSuit trial ends on ${trialEnd}. Add a payment method to continue: https://clawsuit.io/billing`
      );
      break;
    }
  }
}
```

---

## 14. Scheduled Jobs (BullMQ)

```typescript
// packages/core/src/scheduler/index.ts

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export const workflowQueue = new Queue('workflows', { connection: redis });
export const digestQueue = new Queue('digests', { connection: redis });

// Worker that executes scheduled workflows
new Worker('workflows', async (job) => {
  const { userId, workflowId, roleSlug } = job.data;
  
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const userRole = await getUserActiveRole(userId);
  
  await intentRouter.executeWorkflowById(workflowId, {
    user:    { id: userId, phone: user!.phone! },
    role:    userRole!,
    channel: 'whatsapp',
  });
}, { connection: redis });

// On user role activation, schedule all cron workflows
export async function scheduleRoleWorkflows(
  userId: string, 
  bundle: RoleBundle, 
  answers: Record<string, string>
): Promise<void> {
  for (const workflow of bundle.workflows) {
    if (workflow.trigger.type !== 'cron') continue;
    
    const cron = resolveCron(workflow.trigger.value, { answers });
    
    await workflowQueue.add(
      `${userId}-${workflow.id}`,
      { userId, workflowId: workflow.id, roleSlug: bundle.slug },
      {
        repeat: { pattern: cron, tz: 'America/Edmonton' },
        jobId:  `${userId}-${workflow.id}`,  // Unique ID prevents duplicates
      }
    );
  }
}
```

---

## 15. Environment Variables

```bash
# .env.example

# Server
NODE_ENV=development
PORT=4000
API_URL=http://localhost:4000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/clawsuit

# Redis
REDIS_URL=redis://localhost:6379

# WhatsApp Business API
WA_PHONE_NUMBER_ID=           # From Meta Developer Console
WA_ACCESS_TOKEN=              # Permanent system user token
WA_APP_SECRET=                # From Meta App Settings
WA_VERIFY_TOKEN=              # Random string you choose

# Anthropic (for OpenClaw instances)
ANTHROPIC_API_KEY=            # One key pooled across all instances

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_REALTOR=price_...

# Credential encryption (32 random bytes as 64 hex chars)
CREDENTIAL_ENCRYPTION_KEY=    # openssl rand -hex 32

# OpenClaw
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_DATA_DIR=/data/openclaw    # Host path for config volumes

# Pillar 9 MLS (platform-level API key for DDF; per-user credentials separate)
PILLAR9_CLIENT_ID=
PILLAR9_CLIENT_SECRET=

# CREA DDF (platform partnership credentials)
CREA_DDF_TRANSPORT_ID=
CREA_DDF_SECRET=

# OpenAI Whisper (voice transcription)
OPENAI_API_KEY=               # Only used for Whisper, not chat

# Monitoring
BETTERSTACK_SOURCE_TOKEN=

# App
APP_URL=https://clawsuit.io
SECURE_LINK_SECRET=           # openssl rand -hex 32
```

---

## 16. Docker Compose (Development)

```yaml
# infra/docker/docker-compose.yml

version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: clawsuit
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: ../..
      dockerfile: infra/docker/Dockerfile.api
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://user:password@postgres:5432/clawsuit
      REDIS_URL: redis://redis:6379
    env_file: ../../.env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # For container management
      - openclaw_data:/data/openclaw
    depends_on:
      - postgres
      - redis

  gateway:
    build:
      context: ../..
      dockerfile: infra/docker/Dockerfile.gateway
    ports:
      - "4001:4001"
    environment:
      NODE_ENV: development
      REDIS_URL: redis://redis:6379
    env_file: ../../.env
    depends_on:
      - redis
      - api

volumes:
  postgres_data:
  redis_data:
  openclaw_data:
```

---

## 17. API Route Specification

```
POST   /api/v1/onboarding/start              Start onboarding for a role
POST   /api/v1/onboarding/:sessionId/answer  Submit an answer
GET    /api/v1/onboarding/:sessionId/status  Get onboarding progress

GET    /api/v1/roles                         List available role bundles
GET    /api/v1/roles/:slug                   Get role bundle details

POST   /api/v1/credentials/setup-link        Generate secure credential setup link
POST   /api/v1/credentials/:token/save       Save credential from secure page
GET    /api/v1/credentials                   List connected services (no secrets)
DELETE /api/v1/credentials/:service          Disconnect a service

GET    /api/v1/billing/status                Get subscription status
POST   /api/v1/billing/portal               Create Stripe customer portal session
POST   /api/v1/billing/webhook              Stripe webhook receiver

GET    /api/v1/users/me                      Get current user profile
PATCH  /api/v1/users/me                      Update profile
DELETE /api/v1/users/me                      Delete account (GDPR)

POST   /webhook/whatsapp                     WhatsApp incoming messages
GET    /webhook/whatsapp                     WhatsApp webhook verification
POST   /webhook/telegram                     Telegram incoming updates
POST   /webhook/stripe                       Stripe events

GET    /health                               Health check
```

---

## 18. GitHub Repository Setup

### 18.1 README structure

```markdown
# ClawSuit

Role-based AI assistant for messengers. 
Pick a role (Realtor, Recruiter, Student), activate it in WhatsApp, 
and get a fully configured AI assistant with daily workflows — no setup required.

Built on top of [OpenClaw](https://openclaw.ai).

## Quick start — self-hosting
docker compose up -d

## Cloud version
[clawsuit.io](https://clawsuit.io) — $19/mo, 14-day free trial

## Building a new role
See [docs/role-bundle-spec.md](docs/role-bundle-spec.md)

## Roles
| Role | Status | Author |
|------|--------|--------|
| Realtor (Canada) | ✅ Stable | @bujinwang |
| Recruiter | 🚧 Community | Open |
| Mortgage Broker | 🚧 Community | Open |
| Insurance Agent | 🚧 Community | Open |
| University Student | 🚧 Community | Open |
```

### 18.2 CONTRIBUTING.md

Explain role bundle format, link to schema, show how to test locally with `clawsuit bundle validate roles/myrole/bundle.yaml`.

### 18.3 GitHub Actions (.github/workflows/ci.yml)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build

  validate-role-bundles:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install
      - run: pnpm --filter marketplace bundle:validate-all
```

---

## 19. Implementation Order for Codex

Implement in this exact sequence. Each phase must pass tests before starting the next.

### Phase 1 — Foundation (Week 1)
1. Monorepo scaffolding with pnpm workspaces
2. Database schema + Drizzle migrations
3. Role bundle Zod schema + validator
4. Realtor bundle YAML (complete)
5. Role compiler (AGENTS.md, SOUL.md, MEMORY.md, USER.md generation)
6. Compiler unit tests with fixture data

### Phase 2 — Messaging (Week 2)
7. Fastify API server skeleton
8. WhatsApp webhook handler (verify + receive)
9. WhatsApp message sender (text, template, interactive)
10. Voice note transcription (Whisper)
11. Onboarding flow engine (all 5 questions)
12. Redis session storage

### Phase 3 — Infrastructure (Week 3)
13. Docker container manager (provision, start, stop, pause)
14. OpenClaw config file writer (to container volume)
15. Container proxy (route messages to correct instance)
16. BullMQ scheduler (cron workflow execution)
17. Intent router (regex matching + workflow execution)

### Phase 4 — Integrations (Week 4)
18. Pillar 9 RESO API skill
19. Google Calendar OAuth + read skill
20. Credential encryption/decryption
21. Secure credential setup page (simple HTML form)
22. Stripe billing (trial start, webhook handler)

### Phase 5 — Production (Week 5)
23. DigitalOcean App Platform deployment config
24. Environment variable validation on startup
25. Health check endpoint
26. Error handling + structured logging (Pino)
27. Rate limiting per user (Fastify rate-limit)
28. End-to-end test: onboarding → morning digest delivery

---

## 20. Key Constraints Codex Must Respect

1. **Never modify OpenClaw source code** — only write to its config files
2. **Never store credentials in plaintext** — always AES-256-GCM encrypt before DB insert
3. **Never put credentials through WhatsApp** — always use the secure link pattern
4. **WhatsApp template messages only for proactive sends** — freeform only in reply windows
5. **One container per user** — enforce in `provisionContainer()`, never share
6. **`CREDENTIAL_ENCRYPTION_KEY` must be validated on startup** — crash if missing or wrong length
7. **Rate limit: 60 messages/hour per user** — enforce in gateway middleware
8. **Max container memory: 512MB** — enforce in Docker container config
9. **All TypeScript strict mode** — no `any` without explicit justification
10. **Onboarding session expires after 24 hours** — clean up incomplete sessions daily

---

*End of design document — v0.1.0*
