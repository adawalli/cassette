import { afterEach } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IntakeConfig, OnCompleteConfig, ResolvedTranscriberConfig } from "../src/schemas";

const tempDirs: string[] = [];

export async function makeTempDir(prefix = "cassette-test-"): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function installTempDirCleanup(): void {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
}

export function copyConfig(
  rootDir: string,
  vaultDir: string,
  copyFilename?: string,
): ResolvedTranscriberConfig {
  const base = baseConfig(rootDir);
  return {
    ...base,
    output: {
      ...base.output,
      copy_to: vaultDir,
      ...(copyFilename ? { copy_filename: copyFilename } : {}),
    },
  };
}

export function baseConfig(
  rootDir: string,
  overrides?: {
    on_complete?: OnCompleteConfig;
    intake?: IntakeConfig;
  },
): ResolvedTranscriberConfig {
  return {
    watch: {
      root_dir: rootDir,
      stable_window_ms: 50,
      include_glob: "**/*.json",
      exclude_glob: ["**/_failed/**"],
    },
    output: {
      markdown_suffix: ".md",
      overwrite: false,
    },
    failure: {
      move_failed: true,
      failed_dir_name: "_failed",
      write_error_log: true,
    },
    llm: {
      base_url: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      temperature: 0.1,
      max_tokens: 4000,
      timeout_ms: 1000,
      retries: 1,
    },
    transcript: {
      path: "$.segments[*]",
      speaker_field: "speaker",
      text_field: "text",
    },
    steps: [{ name: "default", prompt: "test prompt" }],
    ...(overrides?.on_complete ? { on_complete: overrides.on_complete } : {}),
    ...(overrides?.intake ? { intake: overrides.intake } : {}),
  };
}
