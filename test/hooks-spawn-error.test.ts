import { describe, expect, spyOn, test } from "bun:test";
import { logger } from "../src/logger";
import type { OnCompleteConfig } from "../src/schemas";
import { runOnCompleteHook } from "../src/hooks";

const config: OnCompleteConfig = { command: "whatever", timeout_ms: 5000 };

describe("runOnCompleteHook spawn failure", () => {
  test("logs and resolves instead of crashing the process", async () => {
    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    const originalPath = process.env.PATH;
    try {
      // Bun resolves the executable asynchronously; keep PATH missing until the hook settles.
      process.env.PATH = "/definitely-no-cassette-bin";
      await expect(runOnCompleteHook(config, {})).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[hooks] on_complete spawn failed:"),
      );
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      warnSpy.mockRestore();
    }
  });
});
