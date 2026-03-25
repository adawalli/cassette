import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([".json", ".vtt"]);

export function normalizeForGlob(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (isEnoent(err)) {
      return false;
    }
    throw err;
  }
}

export function expandTilde(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(homedir(), p.slice(1));
  }
  return p;
}

export function markdownPathFor(filePath: string, markdownSuffix: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return `${filePath}${markdownSuffix}`;
  }
  return `${filePath.slice(0, -ext.length)}${markdownSuffix}`;
}

export function isJsonPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".json";
}

export function isVttPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".vtt";
}

export function isInFailedDirectory(filePath: string, failedDirName: string): boolean {
  const segments = filePath.split(path.sep);
  return segments.includes(failedDirName);
}

export function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export async function walkDirectory(
  dir: string,
  filter: (filePath: string) => boolean,
  skipDir?: (dirPath: string) => boolean,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDir || !skipDir(full)) {
          await walk(full);
        }
      } else if (entry.isFile() && filter(full)) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}
