import { copyFile, mkdir, readdir, rename, unlink } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { logger } from "./logger";
import { exists, normalizeForGlob } from "./paths";
import { waitForStableFile } from "./stable-wait";
import type { ResolvedTranscriberConfig } from "./schemas";

export function weekDir(now: Date): string {
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

function createIntakeFilter(config: ResolvedTranscriberConfig): (filePath: string) => boolean {
  const intake = config.intake!;
  const includeMatcher = picomatch(intake.include_glob);
  const excludeMatchers = intake.exclude_glob.map((p) => picomatch(p));

  return (filePath: string): boolean => {
    const relative = path.relative(intake.source_dir, filePath);
    if (!relative || relative.startsWith("..")) {
      return false;
    }
    const normalized = normalizeForGlob(relative);
    if (!includeMatcher(normalized)) {
      return false;
    }
    if (excludeMatchers.some((m) => m(normalized))) {
      return false;
    }
    return true;
  };
}

export async function intakeFile(
  filePath: string,
  config: ResolvedTranscriberConfig,
): Promise<string> {
  if (!(await exists(filePath))) {
    throw new FileGoneError(filePath);
  }
  await waitForStableFile(filePath, config.watch.stable_window_ms);

  const fileName = path.basename(filePath);
  const destDir = path.join(config.watch.root_dir, weekDir(new Date()));
  let destPath = path.join(destDir, fileName);

  if (await exists(destPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    destPath = path.join(destDir, `${stamp}-${fileName}`);
  }

  await mkdir(path.dirname(destPath), { recursive: true });

  if (config.intake!.delete_source) {
    await moveFile(filePath, destPath);
  } else {
    await copyFile(filePath, destPath);
  }
  const verb = config.intake!.delete_source ? "moved" : "copied";
  logger.info(`[intake] ${verb}: ${filePath} -> ${destPath}`);

  return destPath;
}

export async function executeIntake(config: ResolvedTranscriberConfig): Promise<string[]> {
  const sourceDir = config.intake!.source_dir;
  const shouldIntake = createIntakeFilter(config);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && shouldIntake(full)) {
        const destPath = await intakeFile(full, config);
        results.push(destPath);
      }
    }
  }

  await walk(sourceDir);
  return results;
}

export type IntakeWatcherOptions = {
  config: ResolvedTranscriberConfig;
  onIntake: (destPath: string) => void;
};

export function startIntakeWatcher(options: IntakeWatcherOptions): () => void {
  const { config, onIntake } = options;
  const sourceDir = config.intake!.source_dir;
  const shouldIntake = createIntakeFilter(config);
  const inflight = new Set<string>();

  const watcher = watch(
    sourceDir,
    { recursive: true },
    (_eventType: string, fileName: string | Buffer | null) => {
      if (!fileName) {
        return;
      }
      const rawName = typeof fileName === "string" ? fileName : fileName.toString("utf8");
      const fullPath = path.join(sourceDir, rawName);
      if (!shouldIntake(fullPath) || inflight.has(fullPath)) {
        return;
      }
      inflight.add(fullPath);
      (async () => {
        try {
          const destPath = await intakeFile(fullPath, config);
          onIntake(destPath);
        } catch (err) {
          if (!(err instanceof FileGoneError)) {
            logger.error(`[intake] watcher error for ${fullPath}: ${err}`);
          }
        } finally {
          inflight.delete(fullPath);
        }
      })();
    },
  );

  return () => watcher.close();
}
