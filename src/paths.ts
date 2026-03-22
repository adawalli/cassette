import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([".json", ".vtt"]);

export function normalizeForGlob(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
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
