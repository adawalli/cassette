import { watch } from "node:fs";
import { createFileFilter } from "./file-filter";
import { logger } from "./logger";
import { errorMessage, resolveWatchedPath } from "./paths";
import type { AsyncHandle, ResolvedTranscriberConfig } from "./schemas";

export type WatcherOptions = {
  config: ResolvedTranscriberConfig;
  onFilePath: (filePath: string) => void;
};

export function startRecursiveWatcher(options: WatcherOptions): AsyncHandle {
  const shouldProcess = createFileFilter(options.config);
  const watcher = watch(
    options.config.watch.root_dir,
    { recursive: true },
    (_eventType: string, fileName: string | Buffer | null) => {
      const fullPath = resolveWatchedPath(options.config.watch.root_dir, fileName);
      if (!fullPath) {
        return;
      }
      if (!shouldProcess(fullPath)) {
        return;
      }
      options.onFilePath(fullPath);
    },
  );

  // An unhandled 'error' event would take the whole daemon down (e.g. EMFILE, or the
  // watched directory being removed).
  watcher.on("error", (err) => {
    logger.error(
      `[watcher] ${options.config.watch.root_dir} stopped watching: ${errorMessage(err)}`,
    );
  });

  return { stop: () => watcher.close(), onIdle: () => Promise.resolve() };
}
