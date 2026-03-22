import path from "node:path";
import picomatch from "picomatch";
import { normalizeForGlob, SUPPORTED_EXTENSIONS } from "./paths";
import type { TranscriberConfig } from "./schemas";

type GlobFilterOptions = {
  baseDir: string;
  includeGlob: string;
  excludeGlobs: string[];
  extraCheck?: (normalized: string) => boolean;
};

export function createGlobFilter(options: GlobFilterOptions): (filePath: string) => boolean {
  const includeMatcher = picomatch(options.includeGlob);
  const excludeMatchers = options.excludeGlobs.map((p) => picomatch(p));

  return (filePath: string): boolean => {
    const relative = path.relative(options.baseDir, filePath);
    if (!relative || relative.startsWith("..")) {
      return false;
    }
    const normalized = normalizeForGlob(relative);
    if (options.extraCheck && !options.extraCheck(normalized)) {
      return false;
    }
    if (!includeMatcher(normalized)) {
      return false;
    }
    if (excludeMatchers.some((m) => m(normalized))) {
      return false;
    }
    return true;
  };
}

export function createFileFilter(config: TranscriberConfig): (filePath: string) => boolean {
  const failedDirName = config.failure.failed_dir_name;

  return createGlobFilter({
    baseDir: config.watch.root_dir,
    includeGlob: config.watch.include_glob,
    excludeGlobs: config.watch.exclude_glob,
    extraCheck: (normalized) => {
      const ext = path.extname(normalized).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return false;
      }
      if (normalized.split("/").includes(failedDirName)) {
        return false;
      }
      return true;
    },
  });
}
