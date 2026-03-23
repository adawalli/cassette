import { z } from "zod";

export const WatchConfigSchema = z.object({
  root_dir: z.string().min(1),
  stable_window_ms: z.number().int().positive().default(3000),
  include_glob: z.string().default("**/*.{json,vtt}"),
  exclude_glob: z.array(z.string()).default(["**/_failed/**"]),
});

const ALLOWED_TEMPLATE_VARS = new Set(["date", "stem", "title"]);

export const OutputConfigSchema = z
  .object({
    markdown_suffix: z.string().min(1).default(".md"),
    overwrite: z.boolean().default(false),
    copy_to: z.string().optional(),
    copy_filename: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.copy_filename === undefined) return;
    const vars = [...data.copy_filename.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]!.trim());
    const unknown = vars.filter((v) => !ALLOWED_TEMPLATE_VARS.has(v));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `copy_filename contains unknown variable(s): {{${unknown.join("}}, {{")}}}}. Allowed: {{date}}, {{stem}}, {{title}}`,
      });
    }
  });

export const FailureConfigSchema = z.object({
  move_failed: z.boolean().default(true),
  failed_dir_name: z.string().min(1).default("_failed"),
  write_error_log: z.boolean().default(true),
});

export const LlmConfigSchema = z.object({
  base_url: z.string().url().default("https://api.openai.com/v1/"),
  model: z.string().min(1).default("gpt-4o"),
  temperature: z.number().min(0).max(2).default(0.1),
  max_tokens: z.number().int().positive().default(4000),
  timeout_ms: z.number().int().positive().default(120000),
  retries: z.number().int().min(0).default(5),
  retry_delay_ms: z.number().int().min(0).default(5000),
});

export const TranscriptConfigSchema = z.object({
  path: z.string().min(1).default("$[*]"),
  speaker_field: z.string().min(1).optional(),
  text_field: z.string().min(1).optional(),
});

export const OnCompleteConfigSchema = z.object({
  command: z.string().min(1),
  timeout_ms: z.number().int().positive().default(10000),
});

export const StepConfigSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  suffix: z.string().min(1).optional(),
  llm: LlmConfigSchema.partial().optional(),
  notify: z.boolean().default(false),
});

export const IntakeConfigSchema = z.object({
  source_dir: z.string().min(1),
  include_glob: z.string().default("**/*.vtt"),
  exclude_glob: z.array(z.string()).default([]),
  delete_source: z.boolean().default(true),
});

export const TranscriberConfigSchema = z
  .object({
    watch: WatchConfigSchema,
    output: OutputConfigSchema.optional().default(OutputConfigSchema.parse({})),
    failure: FailureConfigSchema.optional().default(FailureConfigSchema.parse({})),
    llm: LlmConfigSchema.optional().default(LlmConfigSchema.parse({})),
    transcript: TranscriptConfigSchema,
    prompt: z.string().min(1).optional(),
    steps: z.array(StepConfigSchema).min(1).optional(),
    on_complete: OnCompleteConfigSchema.optional(),
    intake: IntakeConfigSchema.optional(),
  })
  .refine((data) => Boolean(data.prompt) !== Boolean(data.steps), {
    message: "Provide either 'prompt' or 'steps', not both (and not neither)",
  });

export const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});

export const TranscriptUnitSchema = z.object({
  speaker: z.string().min(1).optional(),
  text: z.string().min(1),
  index: z.number().int().nonnegative(),
});

export const StepResultSchema = z.object({
  stepName: z.string().min(1),
  markdownPath: z.string().min(1),
  warnings: z.array(z.string()),
});

export const ProcessingSuccessSchema = z.object({
  status: z.literal("success"),
  markdownPath: z.string().min(1),
  warnings: z.array(z.string()),
  stepResults: z.array(StepResultSchema).optional(),
});

export const ProcessingSkippedSchema = z.object({
  status: z.literal("skipped"),
  reason: z.literal("markdown_exists"),
});

export const ProcessingFailedSchema = z.object({
  status: z.literal("failed"),
  errorMessage: z.string().min(1),
  errorLogPath: z.string().min(1).optional(),
  quarantinedPath: z.string().min(1).optional(),
  failedStep: z.string().optional(),
});

export const ProcessingResultSchema = z.union([
  ProcessingSuccessSchema,
  ProcessingSkippedSchema,
  ProcessingFailedSchema,
]);

export type TranscriberConfig = z.infer<typeof TranscriberConfigSchema>;
export type TranscriptConfig = z.infer<typeof TranscriptConfigSchema>;
export type TranscriptUnit = z.infer<typeof TranscriptUnitSchema>;
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type StepConfig = z.infer<typeof StepConfigSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;
export type OnCompleteConfig = z.infer<typeof OnCompleteConfigSchema>;

// ResolvedTranscriberConfig is the shape after normalization in loadConfig.
// It always has `steps` and never has `prompt`.
export type IntakeConfig = z.infer<typeof IntakeConfigSchema>;

export type ResolvedTranscriberConfig = Omit<TranscriberConfig, "prompt" | "steps"> & {
  steps: StepConfig[];
};
