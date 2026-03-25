import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { createGlobFilter } from "./file-filter";
import { logger } from "./logger";
import { exists, resolveWatchedPath, walkDirectory } from "./paths";
import { waitForStableFile } from "./stable-wait";
import type { AsyncHandle, IntakeConfig, ResolvedTranscriberConfig } from "./schemas";

export type ConfigWithIntake = ResolvedTranscriberConfig & { intake: IntakeConfig };

function requireIntake(config: ResolvedTranscriberConfig): ConfigWithIntake {
  if (!config.intake) throw new Error("intake config required");
  return config as ConfigWithIntake;
}

export function weekSubpath(now: Date): string {
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  const yyyy = String(monday.getFullYear());
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return path.join(yyyy, `${mm}-${dd}`);
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    // rename fails across filesystems (EXDEV); fall back to copy + delete
    await copyFile(src, dest);
    await unlink(src);
  }
}

class FileGoneError extends Error {
  constructor(filePath: string) {
    super(`Source file no longer exists: ${filePath}`);
  }
}

function logIntakeError(context: string, filePath: string, err: unknown): void {
  if (!(err instanceof FileGoneError)) {
    logger.error(
      `[intake] ${context} error for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function createIntakeFilter(config: ConfigWithIntake): (filePath: string) => boolean {
  return createGlobFilter({
    baseDir: config.intake.source_dir,
    includeGlob: config.intake.include_glob,
    excludeGlobs: config.intake.exclude_glob,
  });
}

export async function intakeFile(
  filePath: string,
  config: ConfigWithIntake,
  now: () => Date = () => new Date(),
): Promise<string> {
  if (!(await exists(filePath))) {
    throw new FileGoneError(filePath);
  }
  await waitForStableFile(filePath, config.watch.stable_window_ms);

  const { intake } = config;
  const fileName = path.basename(filePath);
  const destDir = path.join(config.watch.root_dir, weekSubpath(now()));
  let destPath = path.join(destDir, fileName);

  if (await exists(destPath)) {
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    destPath = path.join(destDir, `${stamp}-${fileName}`);
  }

  await mkdir(path.dirname(destPath), { recursive: true });

  if (intake.delete_source) {
    await moveFile(filePath, destPath);
  } else {
    await copyFile(filePath, destPath);
  }
  const verb = intake.delete_source ? "moved" : "copied";
  logger.info(`[intake] ${verb}: ${filePath} -> ${destPath}`);

  return destPath;
}

export async function executeIntake(config: ConfigWithIntake): Promise<string[]> {
  const shouldIntake = createIntakeFilter(config);
  const matchedFiles = await walkDirectory(config.intake.source_dir, shouldIntake);
  const results: string[] = [];
  for (const filePath of matchedFiles) {
    try {
      const destPath = await intakeFile(filePath, config);
      results.push(destPath);
    } catch (err) {
      logIntakeError("executeIntake", filePath, err);
    }
  }
  return results;
}

export type IntakeWatcherOptions = {
  config: ConfigWithIntake;
  onIntake: (destPath: string) => void;
};

export function startIntakeWatcher(options: IntakeWatcherOptions): AsyncHandle {
  const { config, onIntake } = options;
  const sourceDir = config.intake.source_dir;
  const shouldIntake = createIntakeFilter(config);
  const inflight = new Map<string, Promise<void>>();

  const watcher = watch(
    sourceDir,
    { recursive: true },
    (_eventType: string, fileName: string | Buffer | null) => {
      const fullPath = resolveWatchedPath(sourceDir, fileName);
      if (!fullPath || !shouldIntake(fullPath) || inflight.has(fullPath)) {
        return;
      }
      const p = (async () => {
        try {
          const destPath = await intakeFile(fullPath, config);
          onIntake(destPath);
        } catch (err) {
          logIntakeError("watcher", fullPath, err);
        } finally {
          inflight.delete(fullPath);
        }
      })();
      inflight.set(fullPath, p);
    },
  );

  return {
    stop: () => watcher.close(),
    onIdle: () => Promise.all(inflight.values()).then(() => {}),
  };
}
