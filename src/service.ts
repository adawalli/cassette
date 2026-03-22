import { readdir } from "node:fs/promises";
import path from "node:path";
import { createFileFilter } from "./file-filter";
import { runOnCompleteHook } from "./hooks";
import { scanIntakeFiles, startIntakeWatcher } from "./intake";
import type { LlmClient } from "./llm";
import { logger } from "./logger";
import { isInFailedDirectory } from "./paths";
import { processTranscriptFile } from "./processor";
import { SerialQueue } from "./queue";
import type { ProcessingResult, ResolvedTranscriberConfig } from "./schemas";
import { startRecursiveWatcher } from "./watcher";

type ServiceDeps = {
  llmClient: LlmClient;
};

function logProcessingResult(filePath: string, result: ProcessingResult): void {
  if (result.status === "success") {
    if (result.stepResults && result.stepResults.length > 1) {
      for (const step of result.stepResults) {
        logger.info(`[processor] step "${step.stepName}": ${filePath} -> ${step.markdownPath}`);
        if (step.warnings.length > 0) {
          logger.warn(`[processor] step "${step.stepName}" warnings: ${step.warnings.join(" | ")}`);
        }
      }
    } else {
      logger.info(`[processor] success: ${filePath} -> ${result.markdownPath}`);
      if (result.warnings.length > 0) {
        logger.warn(`[processor] warnings: ${result.warnings.join(" | ")}`);
      }
    }
    return;
  }

  if (result.status === "skipped") {
    logger.info(`[processor] skipped (${result.reason}): ${filePath}`);
    return;
  }

  const details: string[] = [`error=${result.errorMessage}`];
  if (result.failedStep) {
    details.push(`step=${result.failedStep}`);
  }
  if (result.quarantinedPath) {
    details.push(`quarantined=${result.quarantinedPath}`);
  }
  if (result.errorLogPath) {
    details.push(`log=${result.errorLogPath}`);
  }
  logger.error(`[processor] failed: ${filePath} (${details.join(", ")})`);
}

async function fireOnCompleteHooks(
  filePath: string,
  result: ProcessingResult,
  config: ResolvedTranscriberConfig,
): Promise<void> {
  if (!config.on_complete || result.status !== "success") {
    return;
  }

  const { on_complete } = config;
  const baseVars = { input: filePath, root_dir: config.watch.root_dir };

  if (result.stepResults && result.stepResults.length > 0) {
    for (const stepResult of result.stepResults) {
      const stepConfig = config.steps.find((s) => s.name === stepResult.stepName);
      if (stepConfig?.notify) {
        await runOnCompleteHook(on_complete, {
          ...baseVars,
          output: stepResult.markdownPath,
          step_name: stepResult.stepName,
          step_output: stepResult.markdownPath,
        });
      }
    }
  }

  await runOnCompleteHook(on_complete, { ...baseVars, output: result.markdownPath });
}

export async function scanInputFiles(config: ResolvedTranscriberConfig): Promise<string[]> {
  const results: string[] = [];
  const shouldProcess = createFileFilter(config);
  const rootDir = config.watch.root_dir;
  const failedDirName = config.failure.failed_dir_name;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (isInFailedDirectory(full, failedDirName)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && shouldProcess(full)) {
        results.push(full);
      }
    }
  }

  await walk(rootDir);
  return results;
}

export async function runBackfill(
  config: ResolvedTranscriberConfig,
  deps: ServiceDeps,
): Promise<void> {
  if (config.intake) {
    await scanIntakeFiles(config);
  }
  const queue = new SerialQueue();
  const files = await scanInputFiles(config);
  for (const filePath of files) {
    queue.enqueue(async () => {
      logger.info(`[processor] processing: ${filePath}`);
      const result = await processTranscriptFile(filePath, config, {
        llmClient: deps.llmClient,
      });
      logProcessingResult(filePath, result);
      await fireOnCompleteHooks(filePath, result, config);
    });
  }
  await queue.onIdle();
}

export async function runService(
  config: ResolvedTranscriberConfig,
  deps: ServiceDeps,
): Promise<() => void> {
  const queue = new SerialQueue();
  const pending = new Set<string>();

  const enqueuePath = (filePath: string): void => {
    if (pending.has(filePath)) {
      return;
    }
    pending.add(filePath);
    queue.enqueue(async () => {
      try {
        logger.info(`[processor] processing: ${filePath}`);
        const result = await processTranscriptFile(filePath, config, {
          llmClient: deps.llmClient,
        });
        logProcessingResult(filePath, result);
        await fireOnCompleteHooks(filePath, result, config);
      } finally {
        pending.delete(filePath);
      }
    });
  };

  if (config.intake) {
    const intakeFiles = await scanIntakeFiles(config);
    for (const filePath of intakeFiles) {
      enqueuePath(filePath);
    }
  }

  const startupFiles = await scanInputFiles(config);
  for (const filePath of startupFiles) {
    enqueuePath(filePath);
  }

  const stopMainWatcher = startRecursiveWatcher({
    config,
    onFilePath: enqueuePath,
  });

  if (config.intake) {
    const stopIntakeWatcher = startIntakeWatcher({ config, onIntake: enqueuePath });
    return () => {
      stopIntakeWatcher();
      stopMainWatcher();
    };
  }

  return stopMainWatcher;
}
