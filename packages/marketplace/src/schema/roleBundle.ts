import { z } from "zod";

export const WorkflowTriggerSchema = z.object({
  type: z.enum(["cron", "intent", "event"]),
  value: z.string()
});

export const WorkflowStepSchema = z.object({
  id: z.string(),
  skill: z.string(),
  input: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])),
  output: z.string().optional()
});

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowStepSchema).min(1),
  outputFormat: z.string().optional()
});

export const OnboardingQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(["text", "choice", "time", "email"]),
  choices: z.array(z.string()).optional(),
  required: z.boolean().default(true)
}).superRefine((question, ctx) => {
  if (question.type === "choice" && (!question.choices || question.choices.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choice questions must declare at least one option",
      path: ["choices"]
    });
  }
});

export const RoleBundleSchema = z.object({
  slug: z.string().regex(/^[a-z-]+$/),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.object({
    monthly: z.number().nonnegative(),
    currency: z.string().default("CAD")
  }),
  onboarding: z.object({
    questions: z.array(OnboardingQuestionSchema).min(1)
  }),
  skills: z.array(z.string()).min(1),
  workflows: z.array(WorkflowSchema).min(1),
  soul: z.object({
    persona: z.string(),
    tone: z.string(),
    boundaries: z.array(z.string()).min(1)
  }),
  channels: z.object({
    primary: z.enum(["whatsapp", "telegram", "slack", "email"]),
    fallback: z.enum(["whatsapp", "telegram", "slack", "email"]).optional()
  }),
  dataConnections: z.array(z.object({
    service: z.string(),
    required: z.boolean(),
    setupUrl: z.url()
  }))
});

export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type RoleBundle = z.infer<typeof RoleBundleSchema>;
