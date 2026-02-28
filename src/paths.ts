import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([".json", ".vtt"]);

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
