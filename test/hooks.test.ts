import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { replaceTemplateVars, runOnCompleteHook } from "../src/hooks";
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

  test("handles empty vars record", () => {
    const result = replaceTemplateVars("{{foo}} {{bar}}", {});
    expect(result).toBe("{{foo}} {{bar}}");
  });
});

describe("runOnCompleteHook", () => {
  test("resolves without error on successful command", async () => {
    await expect(
      runOnCompleteHook(hookConfig({ command: "echo ok" }), {}),
    ).resolves.toBeUndefined();
  });

  test("resolves without throwing on failed command (exit 1)", async () => {
    await expect(runOnCompleteHook(hookConfig({ command: "exit 1" }), {})).resolves.toBeUndefined();
  });

  test("resolves without throwing on timeout", async () => {
    await expect(
      runOnCompleteHook(hookConfig({ command: "sleep 60", timeout_ms: 100 }), {}),
    ).resolves.toBeUndefined();
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
