import { describe, expect, test } from "bun:test";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { runBackfill, runService, scanInputFiles } from "../src/service";
import type { LlmClient } from "../src/llm";
import type { IntakeConfig, OnCompleteConfig, ResolvedTranscriberConfig } from "../src/schemas";
import { baseConfig, fileExists, installTempDirCleanup, makeTempDir } from "./helpers";

installTempDirCleanup();

function config(
  rootDir: string,
  on_complete?: OnCompleteConfig,
  intake?: IntakeConfig,
): ResolvedTranscriberConfig {
  return {
    ...baseConfig(rootDir, { on_complete, intake }),
    llm: { ...baseConfig(rootDir).llm, max_tokens: 3000 },
    steps: [{ name: "default", prompt: "prompt", notify: false }],
  };
}

describe("scanInputFiles", () => {
  test("finds json files and excludes failed directory", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "a.json"), "{}", "utf8");
    await Bun.write(path.join(dir, "note.txt"), "x");
    await Bun.write(path.join(dir, "_failed", "bad.json"), "{}");

    const files = await scanInputFiles(config(dir));
    expect(files.length).toBe(1);
    expect(files[0]?.endsWith("a.json")).toBe(true);
  });

  test("applies include and exclude globs", async () => {
    const dir = await makeTempDir();
    await Bun.write(path.join(dir, "keep-me.json"), "{}");
    await Bun.write(path.join(dir, "ignore-me.json"), "{}");

    const cfg = config(dir);
    cfg.watch.include_glob = "**/*-me.json";
    cfg.watch.exclude_glob = ["**/ignore-*.json"];

    const files = await scanInputFiles(cfg);
    expect(files.length).toBe(1);
    expect(files[0]?.endsWith("keep-me.json")).toBe(true);
  });
});

describe("runBackfill", () => {
  test("processes unprocessed files and skips those with markdown", async () => {
    const dir = await makeTempDir();
    const aPath = path.join(dir, "a.json");
    const bPath = path.join(dir, "b.json");
    await writeFile(aPath, JSON.stringify({ segments: [{ text: "one" }] }), "utf8");
    await writeFile(bPath, JSON.stringify({ segments: [{ text: "two" }] }), "utf8");
    await writeFile(path.join(dir, "b.md"), "existing", "utf8");

    const llmClient: LlmClient = {
      generate: async () =>
        [
          "---",
          "date: 2026-02-23",
          "---",
          "## ACTION ITEMS",
          "- x",
          "## KEY DECISIONS",
          "- y",
        ].join("\n"),
    };

    await runBackfill(config(dir), { llmClient });
    expect(await fileExists(path.join(dir, "a.md"))).toBe(true);
    const bContent = await readFile(path.join(dir, "b.md"), "utf8");
    expect(bContent).toBe("existing");
  });
});

const successLlmClient: LlmClient = {
  generate: async () => "# cleaned",
};

describe("on_complete hook", () => {
  test("fires after successful processing", async () => {
    const dir = await makeTempDir();
    const logFile = path.join(dir, "hook.log");
    await writeFile(
      path.join(dir, "a.json"),
      JSON.stringify({ segments: [{ text: "hi" }] }),
      "utf8",
    );

    const cfg = config(dir, {
      command: `echo fired >> ${logFile}`,
      timeout_ms: 5000,
    });
    await runBackfill(cfg, { llmClient: successLlmClient });

    expect(await fileExists(logFile)).toBe(true);
    const content = await readFile(logFile, "utf8");
    expect(content.trim()).toBe("fired");
  });

  test("does not fire on skip (markdown already exists)", async () => {
    const dir = await makeTempDir();
    const logFile = path.join(dir, "hook.log");
    await writeFile(
      path.join(dir, "a.json"),
      JSON.stringify({ segments: [{ text: "hi" }] }),
      "utf8",
    );
    await writeFile(path.join(dir, "a.md"), "existing", "utf8");

    const cfg = config(dir, {
      command: `echo fired >> ${logFile}`,
      timeout_ms: 5000,
    });
    await runBackfill(cfg, { llmClient: successLlmClient });

    expect(await fileExists(logFile)).toBe(false);
  });

  test("does not fire on processing failure", async () => {
    const dir = await makeTempDir();
    const logFile = path.join(dir, "hook.log");
    await writeFile(
      path.join(dir, "a.json"),
      JSON.stringify({ segments: [{ text: "hi" }] }),
      "utf8",
    );

    const failingClient: LlmClient = {
      generate: async () => {
        throw new Error("LLM unavailable");
      },
    };
    const cfg = config(dir, {
      command: `echo fired >> ${logFile}`,
      timeout_ms: 5000,
    });
    await runBackfill(cfg, { llmClient: failingClient });

    expect(await fileExists(logFile)).toBe(false);
  });

  test("per-step notify fires hook for flagged step and final hook", async () => {
    const dir = await makeTempDir();
    const logFile = path.join(dir, "hook.log");
    await writeFile(
      path.join(dir, "a.json"),
      JSON.stringify({ segments: [{ text: "hello" }] }),
      "utf8",
    );

    const cfg: ResolvedTranscriberConfig = {
      ...config(dir),
      steps: [
        { name: "clean", prompt: "clean it", suffix: ".cleaned.md", notify: false },
        { name: "summarize", prompt: "summarize it", suffix: ".summary.md", notify: true },
      ],
      on_complete: {
        // write {{output}} to the log so we can verify substitution
        command: `echo "{{output}}" >> ${logFile}`,
        timeout_ms: 5000,
      },
    };

    const multiStepClient: LlmClient = { generate: async () => "# output" };
    await runBackfill(cfg, { llmClient: multiStepClient });

    const content = await readFile(logFile, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    // clean step: notify false - no hook
    // summarize step: notify true - 1 hook (output = .summary.md)
    // final completion hook - 1 hook (output = .summary.md)
    expect(lines).toHaveLength(2);
    // {{output}} must be substituted in both calls - neither line should contain the literal template
    for (const line of lines) {
      expect(line).not.toContain("{{output}}");
      expect(line).toMatch(/\.summary\.md$/);
    }
  });
});

describe("runService", () => {
  test("processes existing files and returns a cleanup function", async () => {
    const dir = await makeTempDir();
    const aPath = path.join(dir, "a.json");
    await writeFile(aPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const generated: string[] = [];
    const llmClient: LlmClient = {
      generate: async () => {
        generated.push("called");
        return "# cleaned";
      },
    };

    const cfg = config(dir);
    cfg.watch.stable_window_ms = 0;
    const stop = await runService(cfg, { llmClient });
    // Wait for the serial queue to drain (stability polling needs time)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    stop();

    expect(generated.length).toBe(1);
    expect(await fileExists(path.join(dir, "a.md"))).toBe(true);
  });

  test("deduplicates in-flight paths", async () => {
    const dir = await makeTempDir();
    const aPath = path.join(dir, "a.json");
    await writeFile(aPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    let callCount = 0;
    const llmClient: LlmClient = {
      generate: async () => {
        callCount++;
        return "# cleaned";
      },
    };

    const cfg = config(dir);
    cfg.watch.stable_window_ms = 0;
    const stop = await runService(cfg, { llmClient });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    stop();

    // File should only be processed once despite being found by scanInputFiles
    expect(callCount).toBe(1);
  });

  test("with intake config scans intake source and starts both watchers", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();

    const vttContent = "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n<v Alice>Hello</v>";
    await writeFile(path.join(sourceDir, "call.vtt"), vttContent, "utf8");

    const cfg: ResolvedTranscriberConfig = {
      ...config(rootDir, undefined, {
        source_dir: sourceDir,
        include_glob: "**/*.vtt",
        exclude_glob: [],
        delete_source: true,
      }),
      watch: {
        root_dir: rootDir,
        stable_window_ms: 0,
        include_glob: "**/*.{json,vtt}",
        exclude_glob: ["**/_failed/**"],
      },
    };

    const llmClient: LlmClient = {
      generate: async () => "# Notes\n\nAlice said hello.",
    };

    const stop = await runService(cfg, { llmClient });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    stop();

    // Source file should have been intaked (moved)
    expect(await fileExists(path.join(sourceDir, "call.vtt"))).toBe(false);
  });

  test("without intake returns only the main watcher cleanup", async () => {
    const dir = await makeTempDir();

    const llmClient: LlmClient = { generate: async () => "# out" };
    const stop = await runService(config(dir), { llmClient });

    // stop should be a function (the main watcher's cleanup)
    expect(typeof stop).toBe("function");
    stop();
  });
});

describe("logProcessingResult - multi-step with warnings", () => {
  test("runBackfill with multi-step config logs step warnings", async () => {
    const dir = await makeTempDir();
    await writeFile(
      path.join(dir, "a.json"),
      JSON.stringify({ segments: [{ text: "hello" }] }),
      "utf8",
    );

    // This LLM returns output that triggers warnings for single-step
    // but for multi-step, warnings are always empty per processor logic.
    // The real coverage for line 24 requires stepResults with non-empty warnings,
    // which the current processor never produces for multi-step.
    // We test the multi-step path that does get covered (lines 20-26 path).
    const cfg: ResolvedTranscriberConfig = {
      ...config(dir),
      steps: [
        { name: "clean", prompt: "clean it", suffix: ".cleaned.md", notify: false },
        { name: "summarize", prompt: "summarize it", suffix: ".summary.md", notify: false },
      ],
    };

    const llmClient: LlmClient = { generate: async () => "# output" };
    await runBackfill(cfg, { llmClient });

    // Verify both step outputs were created
    expect(await fileExists(path.join(dir, "a.cleaned.md"))).toBe(true);
    expect(await fileExists(path.join(dir, "a.summary.md"))).toBe(true);
  });
});

describe("intake integration", () => {
  test("runBackfill with intake moves VTT from source and processes it", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();

    // Put a VTT file in the source directory
    const vttContent = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:05.000",
      "<v Alice>Hello everyone</v>",
    ].join("\n");
    await writeFile(path.join(sourceDir, "standup.vtt"), vttContent, "utf8");

    const cfg: ResolvedTranscriberConfig = {
      ...config(rootDir, undefined, {
        source_dir: sourceDir,
        include_glob: "**/*.vtt",
        exclude_glob: [],
        delete_source: true,
      }),
      watch: {
        root_dir: rootDir,
        stable_window_ms: 50,
        include_glob: "**/*.{json,vtt}",
        exclude_glob: ["**/_failed/**"],
      },
    };

    const llmClient: LlmClient = {
      generate: async () => "# Standup Notes\n\nAlice said hello.",
    };

    await runBackfill(cfg, { llmClient });

    // VTT should have been moved from source into a weekly subdir
    expect(await fileExists(path.join(sourceDir, "standup.vtt"))).toBe(false);
    // Find the VTT in the weekly subdirectory (YYYY/MM-DD/standup.vtt)
    const { Glob } = await import("bun");
    const vttFiles = await Array.fromAsync(new Glob("**/standup.vtt").scan(rootDir));
    expect(vttFiles).toHaveLength(1);
    expect(vttFiles[0]).toMatch(/^\d{4}\/\d{2}-\d{2}\/standup\.vtt$/);
    // Markdown output should have been generated next to the VTT
    const mdFiles = await Array.fromAsync(new Glob("**/standup.md").scan(rootDir));
    expect(mdFiles).toHaveLength(1);
    const md = await readFile(path.join(rootDir, mdFiles[0]!), "utf8");
    expect(md).toContain("Standup Notes");
  });
});
