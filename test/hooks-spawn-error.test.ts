import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import { logger } from "../src/logger";
import type { OnCompleteConfig } from "../src/schemas";

const realChildProcess = { spawn: (await import("node:child_process")).spawn };
const { runOnCompleteHook } = await import("../src/hooks");

// A failed spawn emits 'error'. Without a listener node rethrows it from the event loop,
// killing the daemon and leaving the await below unsettled - the queue would stall forever.
beforeEach(() => {
  mock.module("node:child_process", () => ({
    spawn: () => {
      const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => void };
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      queueMicrotask(() => proc.emit("error", new Error("spawn EACCES")));
      return proc;
    },
  }));
});

afterEach(() => {
  mock.module("node:child_process", () => realChildProcess);
});

const config: OnCompleteConfig = { command: "whatever", timeout_ms: 5000 };

describe("runOnCompleteHook spawn failure", () => {
  test("logs and resolves instead of crashing the process", async () => {
    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await expect(runOnCompleteHook(config, {})).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("spawn EACCES"));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
