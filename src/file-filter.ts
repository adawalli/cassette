import path from "node:path";
import picomatch from "picomatch";
import { SUPPORTED_EXTENSIONS } from "./paths";
import type { TranscriberConfig } from "./schemas";

function normalizeForGlob(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function createFileFilter(config: TranscriberConfig): (filePath: string) => boolean {
  const includeMatcher = picomatch(config.watch.include_glob);
  const excludeMatcher = config.watch.exclude_glob.map((pattern) => picomatch(pattern));
  const failedDirName = config.failure.failed_dir_name;

  return (filePath: string): boolean => {
    const relative = path.relative(config.watch.root_dir, filePath);
    if (!relative || relative.startsWith("..")) {
      return false;
    }
    const normalized = normalizeForGlob(relative);
    const ext = path.extname(normalized).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return false;
    }
    if (normalized.split("/").includes(failedDirName)) {
      return false;
    }
    if (!includeMatcher(normalized)) {
      return false;
    }
    if (excludeMatcher.some((matcher) => matcher(normalized))) {
      return false;
    }
    return true;
  };
}
