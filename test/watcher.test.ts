import { beforeEach, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import type { ResolvedTranscriberConfig } from "../src/schemas";
import { baseConfig } from "./helpers";

// Fake watcher returned by our mock fs.watch
type WatchListener = (eventType: string, filename: string | Buffer | null) => void;

let capturedListener: WatchListener;
const fakeClose = mock(() => {});

mock.module("node:fs", () => ({
  watch: (_dir: string, _opts: unknown, listener: WatchListener) => {
    capturedListener = listener;
    return { close: fakeClose };
  },
}));

// Dynamic import after mock is set up
const { startRecursiveWatcher } = await import("../src/watcher");

const ROOT = "/tmp/cassette-test-watch";

function makeConfig(
  overrides?: Partial<ResolvedTranscriberConfig["watch"]>,
): ResolvedTranscriberConfig {
  return {
    ...baseConfig(ROOT),
    watch: { ...baseConfig(ROOT).watch, include_glob: "**/*.{json,vtt}", ...overrides },
  };
}

beforeEach(() => {
  fakeClose.mockClear();
});

describe("startRecursiveWatcher", () => {
  test("calls onFilePath for matching .json files", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", "meeting.json");
    expect(received).toEqual([path.join(ROOT, "meeting.json")]);
  });

  test("calls onFilePath for matching .vtt files", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", "transcript.vtt");
    expect(received).toEqual([path.join(ROOT, "transcript.vtt")]);
  });

  test("calls onFilePath for nested paths", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", "sub/dir/file.json");
    expect(received).toEqual([path.join(ROOT, "sub/dir/file.json")]);
  });

  test("does NOT call onFilePath for non-matching extensions", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", "readme.txt");
    capturedListener("rename", "output.log");
    capturedListener("rename", "document.pdf");
    capturedListener("rename", "image.png");

    expect(received).toEqual([]);
  });

  test("ignores null filenames gracefully", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    // Should not throw
    capturedListener("rename", null as unknown as string);
    expect(received).toEqual([]);
  });

  test("handles Buffer filenames by converting to string", () => {
    const received: string[] = [];
    const config = makeConfig();
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", Buffer.from("recording.vtt") as unknown as string);
    expect(received).toEqual([path.join(ROOT, "recording.vtt")]);
  });

  test("builds full path by joining root_dir + filename", () => {
    const received: string[] = [];
    const customRoot = "/home/user/meetings";
    const config = makeConfig({ root_dir: customRoot });
    startRecursiveWatcher({ config, onFilePath: (p) => received.push(p) });

    capturedListener("rename", "call.json");
    expect(received).toEqual([path.join(customRoot, "call.json")]);
  });

  test("returned cleanup function calls watcher.close()", () => {
    const config = makeConfig();
    const cleanup = startRecursiveWatcher({ config, onFilePath: () => {} });

    expect(fakeClose).not.toHaveBeenCalled();
    cleanup();
    expect(fakeClose).toHaveBeenCalledTimes(1);
  });
});
