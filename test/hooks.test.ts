import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runOnCompleteHook } from "../src/hooks";
import { logger } from "../src/logger";
import { replaceTemplateVars } from "../src/paths";
import type { OnCompleteConfig } from "../src/schemas";

function hookConfig(overrides?: Partial<OnCompleteConfig>): OnCompleteConfig {
  return { command: "echo ok", timeout_ms: 5000, ...overrides };
}

describe("replaceTemplateVars", () => {
  test("replaces known variables", () => {
    const result = replaceTemplateVars("Hello {{name}}, your file is {{path}}", {
      name: "Alice",
      path: "/tmp/foo.json",
    });
    expect(result).toBe("Hello Alice, your file is /tmp/foo.json");
  });

  test("leaves unknown variables intact", () => {
    const result = replaceTemplateVars("Transcribed {{input}} -> {{output}}", {
      input: "/tmp/a.json",
    });
    expect(result).toBe("Transcribed /tmp/a.json -> {{output}}");
  });
});

describe("runOnCompleteHook", () => {
  test("reports stderr from a failed command", async () => {
    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await runOnCompleteHook(hookConfig({ command: "echo hook-error >&2; exit 7" }), {});
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "on_complete failed (exit 7): echo hook-error >&2; exit 7 | stderr: hook-error",
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("reports a timed-out command", async () => {
    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await runOnCompleteHook(hookConfig({ command: "exec sleep 60", timeout_ms: 100 }), {});
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("on_complete timed out after 100ms"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("substitutes template vars into command", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "cassette-hooks-"));
    try {
      const outFile = path.join(tmpDir, "out.txt");
      await runOnCompleteHook(hookConfig({ command: `echo {{msg}} > ${outFile}` }), {
        msg: "hello-from-hook",
      });
      const content = await Bun.file(outFile).text();
      expect(content.trim()).toBe("hello-from-hook");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
