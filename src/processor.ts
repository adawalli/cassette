import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractTranscriptUnits, renderTranscript } from "./extract";
import type { LlmClient } from "./llm";
import { logger } from "./logger";
import { exists, expandTilde, isVttPath, markdownPathFor } from "./paths";
import { waitForStableFile } from "./stable-wait";
import { extractVttTranscriptUnits } from "./vtt-extract";
import {
  ProcessingResultSchema,
  type ProcessingResult,
  type ResolvedTranscriberConfig,
  type StepResult,
} from "./schemas";

type ProcessorDeps = {
  llmClient: LlmClient;
  now?: () => Date;
};

function collectMarkdownWarnings(markdown: string): string[] {
  const warnings: string[] = [];
  if (!markdown.includes("---")) {
    warnings.push("Missing YAML front matter block marker");
  }
  if (!markdown.includes("## Action Items")) {
    warnings.push("Missing Action Items section");
  }
  if (!markdown.includes("## Decisions")) {
    warnings.push("Missing Decisions section");
  }
  return warnings;
}

function formatErrorLog(error: unknown, now: Date): string {
  const message = errorMessage(error);
  const stack = error instanceof Error && error.stack ? error.stack : "";
  return [
    `timestamp: ${now.toISOString()}`,
    `error: ${message}`,
    stack
      ? `stack: |\n${stack
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripOuterCodeFence(text: string): string {
  return text.replace(/^```(?:yaml|markdown|md)?\r?\n([\s\S]*?)\r?\n```\s*$/i, "$1");
}

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;

function recordingDateFromFilename(filePath: string): string | undefined {
  const basename = path.basename(filePath);
  const match = basename.match(DATE_PATTERN);
  return match?.[0];
}

function recordingDateFromBirthtime(fileInfo: { birthtime: Date }): string {
  return fileInfo.birthtime.toISOString().split("T")[0]!;
}

function stripDateFromStem(stem: string): string {
  return stem.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").replace(/[-\s]*\d{4}-\d{2}-\d{2}(?=\.|$)/, "");
}

async function copyOutput(
  sourcePath: string,
  copyTo: string,
  recordingDate: string,
  stem: string,
): Promise<void> {
  const destDir = expandTilde(copyTo);
  const destFilename = `${recordingDate} ${stem}.md`;
  const destPath = path.join(destDir, destFilename);
  await mkdir(destDir, { recursive: true });
  await copyFile(sourcePath, destPath);
  logger.info(`copied output: ${destPath}`);
}

async function quarantineFailure(
  filePath: string,
  config: ResolvedTranscriberConfig,
  error: unknown,
  now: Date,
): Promise<{ errorLogPath?: string; quarantinedPath?: string }> {
  if (!config.failure.move_failed) {
    logger.debug(`quarantine disabled for ${filePath}`);
    return {};
  }

  if (!(await exists(filePath))) {
    logger.warn(`source file missing before quarantine move: ${filePath}`);
    return {};
  }

  const parentDir = path.dirname(filePath);
  const failedDir = path.join(parentDir, config.failure.failed_dir_name);
  logger.debug(`ensuring failed directory exists: ${failedDir}`);
  await mkdir(failedDir, { recursive: true });

  const fileName = path.basename(filePath);
  let quarantinedPath = path.join(failedDir, fileName);
  if (await exists(quarantinedPath)) {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    quarantinedPath = path.join(failedDir, `${stamp}-${fileName}`);
    logger.warn(`quarantine target exists, using timestamped path: ${quarantinedPath}`);
  }

  logger.info(`moving failed source to quarantine: ${quarantinedPath}`);
  await rename(filePath, quarantinedPath);

  let errorLogPath: string | undefined;
  if (config.failure.write_error_log) {
    const baseName = path.basename(fileName, path.extname(fileName));
    errorLogPath = path.join(failedDir, `${baseName}.error.log`);
    logger.debug(`writing failure log: ${errorLogPath}`);
    await writeFile(errorLogPath, formatErrorLog(error, now), "utf8");
  }

  return { errorLogPath, quarantinedPath };
}

export async function processTranscriptFile(
  filePath: string,
  config: ResolvedTranscriberConfig,
  deps: ProcessorDeps,
): Promise<ProcessingResult> {
  const now = deps.now ? deps.now() : new Date();
  const { steps } = config;

  const outputPaths = steps.map((step) =>
    markdownPathFor(filePath, step.suffix ?? config.output.markdown_suffix),
  );

  if (!config.output.overwrite) {
    const existChecks = await Promise.all(outputPaths.map((p) => exists(p)));
    if (existChecks.every(Boolean)) {
      logger.debug(`skipping - all outputs exist: ${outputPaths.join(", ")}`);
      return ProcessingResultSchema.parse({
        status: "skipped",
        reason: "markdown_exists",
      });
    }
  }

  let currentStepIndex = 0;
  try {
    logger.info(
      `waiting for stable file ${filePath} (stable_window_ms=${config.watch.stable_window_ms})`,
    );
    await waitForStableFile(filePath, config.watch.stable_window_ms);
    logger.debug(`file stabilized: ${filePath}`);
    const filenameDate = recordingDateFromFilename(filePath);
    const recordingDate = filenameDate ?? recordingDateFromBirthtime(await stat(filePath));
    logger.debug(
      `recording date: ${recordingDate} (source: ${filenameDate ? "filename" : "birthtime"})`,
    );
    const raw = await readFile(filePath, "utf8");
    logger.debug(`read input bytes: ${raw.length}`);
    const units = isVttPath(filePath)
      ? extractVttTranscriptUnits(raw)
      : extractTranscriptUnits(JSON.parse(raw) as unknown, config.transcript);
    logger.info(`extracted transcript units: ${units.length}`);
    let currentInput = `Recording date: ${recordingDate}\n\n${renderTranscript(units)}`;
    logger.debug(`rendered transcript chars: ${currentInput.length}`);

    const multiStep = steps.length > 1;
    const stepResults: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      currentStepIndex = i;
      const step = steps[i]!;
      const outPath = outputPaths[i]!;

      let stepOutput: string;

      if (!config.output.overwrite && (await exists(outPath))) {
        logger.debug(`step "${step.name}" output exists, reading from disk: ${outPath}`);
        stepOutput = await readFile(outPath, "utf8");
      } else {
        const mergedLlm = { ...config.llm, ...step.llm };
        logger.info(
          `step "${step.name}" calling llm model=${mergedLlm.model} base_url=${mergedLlm.base_url}`,
        );
        stepOutput = stripOuterCodeFence(
          (await deps.llmClient.generate(step.prompt, currentInput, mergedLlm)).trimStart(),
        );
        logger.debug(`step "${step.name}" received output chars: ${stepOutput.length}`);
        await writeFile(outPath, stepOutput, "utf8");
        logger.debug(`step "${step.name}" wrote output: ${outPath}`);
      }

      const warnings = multiStep ? [] : collectMarkdownWarnings(stepOutput);
      if (warnings.length > 0) {
        logger.debug(`step "${step.name}" warnings: ${warnings.join(" | ")}`);
      }

      stepResults.push({ stepName: step.name, markdownPath: outPath, warnings });
      currentInput = stepOutput;
    }

    const lastStep = stepResults[stepResults.length - 1]!;

    if (config.output.copy_to) {
      const rawStem = path.basename(filePath, path.extname(filePath));
      const stem = stripDateFromStem(rawStem);
      await copyOutput(lastStep.markdownPath, config.output.copy_to, recordingDate, stem);
    }

    return ProcessingResultSchema.parse({
      status: "success",
      markdownPath: lastStep.markdownPath,
      warnings: multiStep ? [] : lastStep.warnings,
      stepResults: multiStep ? stepResults : undefined,
    });
  } catch (error) {
    const failedStep = steps[currentStepIndex]?.name;
    logger.error(
      `processing error for ${filePath} at step "${failedStep}": ${errorMessage(error)}`,
    );
    const quarantine = await quarantineFailure(filePath, config, error, now);
    return ProcessingResultSchema.parse({
      status: "failed",
      errorMessage: errorMessage(error),
      failedStep,
      ...quarantine,
    });
  }
}
