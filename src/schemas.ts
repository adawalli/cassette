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
    stem_strip: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.copy_filename !== undefined) {
      const vars = [...data.copy_filename.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);
      const unknown = vars.filter((v) => !ALLOWED_TEMPLATE_VARS.has(v));
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `copy_filename contains unknown variable(s): {{${unknown.join("}}, {{")}}}}. Allowed: {{date}}, {{stem}}, {{title}}`,
        });
      }
    }
    if (data.stem_strip !== undefined) {
      const patterns = Array.isArray(data.stem_strip) ? data.stem_strip : [data.stem_strip];
      for (const p of patterns) {
        try {
          new RegExp(p);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: `stem_strip contains invalid regex: ${p}`,
          });
        }
      }
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
  max_tokens: z.number().int().positive().default(12000),
  timeout_ms: z.number().int().positive().default(120000),
  retries: z.number().int().min(0).default(5),
  retry_delay_ms: z.number().int().min(0).default(5000),
});

export const TranscriptConfigSchema = z.object({
  path: z.string().min(1).default("$[*]"),
  speaker_field: z.string().min(1).default("speaker"),
  text_field: z.string().min(1).default("text"),
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
  notify: z.boolean().optional(),
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
    output: OutputConfigSchema.default(OutputConfigSchema.parse({})),
    failure: FailureConfigSchema.default(FailureConfigSchema.parse({})),
    llm: LlmConfigSchema.default(LlmConfigSchema.parse({})),
    transcript: TranscriptConfigSchema.default(TranscriptConfigSchema.parse({})),
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

export type TranscriberConfig = z.infer<typeof TranscriberConfigSchema>;
export type TranscriptConfig = z.infer<typeof TranscriptConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type StepConfig = z.infer<typeof StepConfigSchema>;
export type OnCompleteConfig = z.infer<typeof OnCompleteConfigSchema>;
export type IntakeConfig = z.infer<typeof IntakeConfigSchema>;

// Everything below is constructed internally, never parsed from user input, so it is a plain type.
export type TranscriptUnit = {
  speaker?: string;
  text: string;
  index: number;
};

export type StepResult = {
  stepName: string;
  markdownPath: string;
  notify?: boolean;
};

export type ProcessingResult =
  | { status: "success"; markdownPath: string; warnings: string[]; stepResults?: StepResult[] }
  | { status: "skipped"; reason: "markdown_exists" }
  | {
      status: "failed";
      errorMessage: string;
      errorLogPath?: string;
      quarantinedPath?: string;
      failedStep?: string;
    };

// ResolvedTranscriberConfig is the shape after normalization in loadConfig.
// It always has `steps` and never has `prompt`.
export type ResolvedTranscriberConfig = Omit<TranscriberConfig, "prompt" | "steps"> & {
  steps: StepConfig[];
};

export type ConfigWithIntake = ResolvedTranscriberConfig & { intake: IntakeConfig };

export type AsyncHandle = {
  stop: () => void;
  onIdle: () => Promise<void>;
};
