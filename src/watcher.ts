import { watch } from "node:fs";
import path from "node:path";
import { createFileFilter } from "./file-filter";
import type { TranscriberConfig } from "./schemas";

export type WatcherOptions = {
  config: TranscriberConfig;
  onFilePath: (filePath: string) => void;
};

export function startRecursiveWatcher(options: WatcherOptions): () => void {
  const shouldProcess = createFileFilter(options.config);
  const watcher = watch(
    options.config.watch.root_dir,
    { recursive: true },
    (_eventType: string, fileName: string | Buffer | null) => {
      if (!fileName) {
        return;
      }

      const rawName = typeof fileName === "string" ? fileName : fileName.toString("utf8");
      const fullPath = path.join(options.config.watch.root_dir, rawName);
      if (!shouldProcess(fullPath)) {
        return;
      }
      options.onFilePath(fullPath);
    },
  );

  return () => watcher.close();
}
