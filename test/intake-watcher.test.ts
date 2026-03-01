import { describe, expect, mock, spyOn, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResolvedTranscriberConfig } from "../src/schemas";
import { baseConfig, installTempDirCleanup, makeTempDir } from "./helpers";

// Capture the watch listener so we can simulate fs events
type WatchListener = (eventType: string, filename: string | Buffer | null) => void;

let capturedListener: WatchListener;
const fakeClose = mock(() => {});

// Mock node:fs to capture the watch listener (same pattern as watcher.test.ts)
mock.module("node:fs", () => ({
  watch: (_dir: string, _opts: unknown, listener: WatchListener) => {
    capturedListener = listener;
    return { close: fakeClose };
  },
}));

// Import real processor first so all its exports survive in the mock.
// Without this spread, mock.module strips processTranscriptFile and breaks
// processor.test.ts when bun runs files alphabetically (intake-watcher before processor).
const realProcessor = await import("../src/processor");
mock.module("../src/processor", () => ({
  ...realProcessor,
  waitForStableFile: async () => {},
}));

// Dynamic import after mocks are set up
const { startIntakeWatcher } = await import("../src/intake");
const { logger } = await import("../src/logger");

installTempDirCleanup();

function intakeWatcherConfig(rootDir: string, sourceDir: string): ResolvedTranscriberConfig {
  return {
    ...baseConfig(rootDir, {
      intake: {
        source_dir: sourceDir,
        include_glob: "**/*.vtt",
        exclude_glob: [],
        delete_source: true,
      },
    }),
    watch: { ...baseConfig(rootDir).watch, stable_window_ms: 0, include_glob: "**/*.{json,vtt}" },
    transcript: { path: "$[*]", text_field: "text", speaker_field: "speaker" },
    steps: [{ name: "default", prompt: "prompt", notify: false }],
  };
}

describe("startIntakeWatcher (mocked fs.watch)", () => {
  test("intakes a matching file and calls onIntake with dest path", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    await writeFile(path.join(sourceDir, "call.vtt"), "WEBVTT\n\nhello", "utf8");

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", "call.vtt");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(intaked).toHaveLength(1);
    expect(intaked[0]).toContain("call.vtt");
  });

  test("ignores null filenames", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", null as unknown as string);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(intaked).toHaveLength(0);
  });

  test("ignores files that do not match the intake filter", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    await writeFile(path.join(sourceDir, "notes.txt"), "hello", "utf8");

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", "notes.txt");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(intaked).toHaveLength(0);
  });

  test("deduplicates in-flight files", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    await writeFile(path.join(sourceDir, "dup.vtt"), "WEBVTT\n\nhello", "utf8");

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", "dup.vtt");
    capturedListener("rename", "dup.vtt");
    capturedListener("rename", "dup.vtt");

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(intaked).toHaveLength(1);
  });

  test("handles FileGoneError silently when file disappears before intake", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", "ghost.vtt");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(intaked).toHaveLength(0);
  });

  test("cleans up inflight set after FileGoneError so file can be reprocessed", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    // File does not exist -> FileGoneError which is silently caught
    capturedListener("rename", "nonexistent.vtt");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // After the error, inflight should be cleaned up, allowing re-processing
    await writeFile(path.join(sourceDir, "nonexistent.vtt"), "WEBVTT\n\nhello", "utf8");
    capturedListener("rename", "nonexistent.vtt");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(intaked).toHaveLength(1);
  });

  test("logs error for non-FileGoneError failures", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    await writeFile(path.join(sourceDir, "exists.vtt"), "WEBVTT\n\nhello", "utf8");

    const errorSpy = spyOn(logger, "error").mockImplementation(() => {});
    const stop = startIntakeWatcher(cfg, () => {
      throw new Error("downstream failure");
    });
    try {
      capturedListener("rename", "exists.vtt");
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[intake] watcher error"));
    } finally {
      stop();
      errorSpy.mockRestore();
    }
  });

  test("handles Buffer filenames", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);

    await writeFile(path.join(sourceDir, "buffer.vtt"), "WEBVTT\n\nhello", "utf8");

    const intaked: string[] = [];
    startIntakeWatcher(cfg, (destPath) => intaked.push(destPath));

    capturedListener("rename", Buffer.from("buffer.vtt") as unknown as string);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(intaked).toHaveLength(1);
    expect(intaked[0]).toContain("buffer.vtt");
  });

  test("returned cleanup function calls watcher.close()", async () => {
    fakeClose.mockClear();
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const cfg = intakeWatcherConfig(rootDir, sourceDir);
    const stop = startIntakeWatcher(cfg, () => {});

    expect(fakeClose).not.toHaveBeenCalled();
    stop();
    expect(fakeClose).toHaveBeenCalledTimes(1);
  });
});
