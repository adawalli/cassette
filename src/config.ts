import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { exists, expandTilde } from "./paths";
import {
  TranscriberConfigSchema,
  type TranscriberConfig,
  type ResolvedTranscriberConfig,
  type StepConfig,
} from "./schemas";

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    return path.join(xdg, "cassette", "config.yaml");
  }
  const home = env.HOME ?? homedir();
  return path.join(home, ".config", "cassette", "config.yaml");
}

export const DEFAULT_CONFIG_YAML = `watch:
  root_dir: ~/Documents/meetings
  stable_window_ms: 3000
  include_glob: "**/*.{json,vtt}"
  exclude_glob:
    - "**/_failed/**"

output:
  markdown_suffix: ".md"
  overwrite: false

failure:
  move_failed: true
  failed_dir_name: "_failed"
  write_error_log: true

llm:
  base_url: "https://api.openai.com/v1/"
  model: "gpt-4o"
  temperature: 0.1
  max_tokens: 12000
  timeout_ms: 120000
  retries: 3

transcript:
  path: "$[*]"
  speaker_field: "speaker"
  text_field: "text"

prompt: |
  You are a meeting transcript editor. Clean up this raw transcript:
  1. Fix obvious transcription errors and filler words (um, uh, like, you know)
  2. Merge fragmented sentences into complete thoughts
  3. Preserve speaker labels and the chronological order
  4. Add a YAML front matter block at the top with exactly these fields:
       tags: [meeting]
       date: YYYY-MM-DD  (infer from transcript content; use today if unknown)
       attendees:
         - "[[Full Name]]"  (quoted wiki-link string, one entry per speaker)
       project:  (leave blank)
       summary: one or two sentence overview of the meeting
       source: cassette
  5. After the front matter, use these sections in this order:
       ## Summary
       A short paragraph summarising the meeting.
       ## Decisions
       A bullet list of decisions made.
       ## Action Items
       A checklist using "- [ ] Owner: task (deadline)" format.
       ## Notes
       The full cleaned transcript.
  6. Output as Markdown

  Do NOT invent information. Only include what is in the transcript.

# Optional: watch a directory (e.g. ~/Downloads) and move matching files
# into root_dir before processing.
# intake:
#   source_dir: ~/Downloads
#   include_glob: "**/*.vtt"
#   exclude_glob: []
#   delete_source: true

# Optional: run a shell command after each file is processed.
# on_complete:
#   command: 'terminal-notifier -title "Cassette" -message "Transcribed {{input}}"'
#   timeout_ms: 10000
`;

export async function initConfigFile(
  configPath: string,
  options?: { force?: boolean },
): Promise<"created" | "exists" | "overwritten"> {
  const force = options?.force ?? false;
  await mkdir(path.dirname(configPath), { recursive: true });

  const hasFile = await exists(configPath);
  if (hasFile && !force) {
    return "exists";
  }

  await writeFile(configPath, DEFAULT_CONFIG_YAML, "utf8");
  if (hasFile) {
    return "overwritten";
  }
  return "created";
}

export function normalizeSteps(config: TranscriberConfig): ResolvedTranscriberConfig {
  const steps: StepConfig[] = config.steps
    ? config.steps
    : [{ name: "default", prompt: config.prompt!, notify: false }];

  const suffixes = steps.map((s) => s.suffix ?? null);
  if (new Set(suffixes).size < suffixes.length) {
    const dup = suffixes.find((s, i) => suffixes.indexOf(s) !== i);
    throw new Error(
      `Duplicate step suffix: "${dup ?? "(default suffix)"}". Each step must produce a unique output file.`,
    );
  }

  const { prompt: _prompt, steps: _steps, ...rest } = config;
  return { ...rest, steps };
}

export async function loadConfig(configPath?: string): Promise<ResolvedTranscriberConfig> {
  const resolvedPath = configPath ?? resolveConfigPath();
  const text = await readFile(resolvedPath, "utf8");
  const parsed = parseYaml(text);
  const config = TranscriberConfigSchema.parse(parsed);
  config.watch.root_dir = expandTilde(config.watch.root_dir);
  if (config.intake) {
    config.intake.source_dir = expandTilde(config.intake.source_dir);
  }
  return normalizeSteps(config);
}
