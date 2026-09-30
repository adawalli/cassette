import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LlmClient } from "../src/llm";
import { logger } from "../src/logger";
import { processTranscriptFile, applyStemStrip } from "../src/processor";
import { OutputConfigSchema, type ResolvedTranscriberConfig } from "../src/schemas";
import { baseConfig, copyConfig, fileExists, installTempDirCleanup, makeTempDir } from "./helpers";

const realStableWait = {
  waitForStableFile: (await import("../src/stable-wait")).waitForStableFile,
};

beforeEach(() => {
  mock.module("../src/stable-wait", () => ({ waitForStableFile: async () => {} }));
});

afterEach(() => {
  mock.module("../src/stable-wait", () => realStableWait);
});

installTempDirCleanup();

describe("processTranscriptFile", () => {
  test("writes sibling markdown on success", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const output = [
      "---",
      "date: 2026-02-23",
      "tags: [meeting]",
      "source: cassette",
      "---",
      "## Summary",
      "A test meeting.",
      "## Decisions",
      "- B",
      "## Action Items",
      "- [ ] A: do something",
      "## Notes",
      "A: hello",
    ].join("\n");
    let input = "";
    let calls = 0;
    const llmClient: LlmClient = {
      generate: async (_prompt, transcript) => {
        calls += 1;
        input = transcript;
        return output;
      },
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    const mdPath = path.join(dir, "meeting.md");
    expect(result).toEqual({
      status: "success",
      markdownPath: mdPath,
      warnings: [],
    });
    expect(calls).toBe(1);
    expect(input).toContain("A: hello");
    expect(await readFile(mdPath, "utf8")).toBe(output);
  });

  test("skips when markdown already exists", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    const mdPath = path.join(dir, "meeting.md");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");
    await writeFile(mdPath, "existing", "utf8");

    const llmClient: LlmClient = {
      generate: async () => "should not run",
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("skipped");
  });

  test("overwrites existing markdown when overwrite is enabled", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    const mdPath = path.join(dir, "meeting.md");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");
    await writeFile(mdPath, "stale", "utf8");

    let calls = 0;
    const llmClient: LlmClient = {
      generate: async () => {
        calls += 1;
        return "fresh";
      },
    };
    const base = baseConfig(dir);
    const config = { ...base, output: { ...base.output, overwrite: true } };

    const result = await processTranscriptFile(jsonPath, config, { llmClient });

    expect(result.status).toBe("success");
    expect(calls).toBe(1);
    expect(await readFile(mdPath, "utf8")).toBe("fresh");
  });

  test("warns when output has no front matter", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () => "plain content without front matter",
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.warnings).toEqual(["Missing YAML front matter block marker"]);
    }
  });

  test("returns failed silently when source file is already missing during quarantine", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "missing.json");
    // File never created - waitForStableFile throws ENOENT, triggering quarantineFailure
    // on a source that no longer exists. The guard should prevent a rename ENOENT crash.
    const llmClient: LlmClient = {
      generate: async () => "should not run",
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("failed");
    // No quarantinedPath or errorLogPath since source didn't exist
    if (result.status === "failed") {
      expect(result.errorMessage).toContain("ENOENT");
      expect(result.quarantinedPath).toBeUndefined();
      expect(result.errorLogPath).toBeUndefined();
    }
  });

  test("copies output to copy_to dir with date-prefixed filename", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "Q1 Planning Sync.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const { stat } = await import("node:fs/promises");
    const recordingDate = (await stat(jsonPath)).birthtime.toISOString().split("T")[0];

    const llmOutput = [
      "---",
      `date: ${recordingDate}`,
      "tags: [meeting]",
      "source: cassette",
      "---",
      "## Summary",
      "Planning meeting.",
      "## Decisions",
      "- Go ahead",
      "## Action Items",
      "- [ ] A: follow up",
      "## Notes",
      "A: hello",
    ].join("\n");

    const llmClient: LlmClient = { generate: async () => llmOutput };
    const config = { ...baseConfig(dir), output: { ...baseConfig(dir).output, copy_to: vaultDir } };

    const result = await processTranscriptFile(jsonPath, config, { llmClient });
    expect(result.status).toBe("success");

    const expectedVaultFile = path.join(vaultDir, `${recordingDate} Q1 Planning Sync.md`);
    expect(await fileExists(expectedVaultFile)).toBe(true);
    const copied = await readFile(expectedVaultFile, "utf8");
    expect(copied).toBe(llmOutput);
  });

  test("extracts recording date from filename prefix instead of birthtime", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-01-15 sprint-planning.meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    let capturedInput = "";
    const llmClient: LlmClient = {
      generate: async (_prompt, input) => {
        capturedInput = input;
        return "---\ndate: 2026-01-15\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
      },
    };

    await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(capturedInput).toContain("Recording date: 2026-01-15");
  });

  test("extracts recording date from legacy filename with trailing date", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "sprint-planning-2026-03-10.meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    let capturedInput = "";
    const llmClient: LlmClient = {
      generate: async (_prompt, input) => {
        capturedInput = input;
        return "---\ndate: 2026-03-10\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
      },
    };

    await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(capturedInput).toContain("Recording date: 2026-03-10");
  });

  test("copy_to strips date from stem to avoid duplication", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-01-15 sprint-planning.meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const llmOutput =
      "---\ndate: 2026-01-15\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
    const llmClient: LlmClient = { generate: async () => llmOutput };
    const config = { ...baseConfig(dir), output: { ...baseConfig(dir).output, copy_to: vaultDir } };

    await processTranscriptFile(jsonPath, config, { llmClient });

    const expectedFile = path.join(vaultDir, "2026-01-15 sprint-planning.meeting.md");
    expect(await fileExists(expectedFile)).toBe(true);
  });

  test("copy_to strips trailing date from legacy filename stem", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "sprint-planning-2026-03-10.meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const llmOutput =
      "---\ndate: 2026-03-10\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
    const llmClient: LlmClient = { generate: async () => llmOutput };
    const config = { ...baseConfig(dir), output: { ...baseConfig(dir).output, copy_to: vaultDir } };

    await processTranscriptFile(jsonPath, config, { llmClient });

    const expectedFile = path.join(vaultDir, "2026-03-10 sprint-planning.meeting.md");
    expect(await fileExists(expectedFile)).toBe(true);
  });

  test("quarantines file and writes error log on failure", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    const source = JSON.stringify({ segments: [{ text: "hello" }] });
    await writeFile(jsonPath, source, "utf8");

    const llmClient: LlmClient = {
      generate: async () => {
        throw new Error("upstream error");
      },
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    const failedJsonPath = path.join(dir, "_failed", "meeting.json");
    const errorLogPath = path.join(dir, "_failed", "meeting.error.log");
    expect(result).toMatchObject({
      status: "failed",
      errorMessage: "upstream error",
      quarantinedPath: failedJsonPath,
      errorLogPath,
    });
    expect(await fileExists(jsonPath)).toBe(false);
    expect(await readFile(failedJsonPath, "utf8")).toBe(source);
    expect(await readFile(errorLogPath, "utf8")).toContain("error: upstream error");
  });

  test("quarantines without an error log when configured", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const base = baseConfig(dir);
    const config = {
      ...base,
      failure: { ...base.failure, write_error_log: false },
    };
    const result = await processTranscriptFile(jsonPath, config, {
      llmClient: {
        generate: async () => {
          throw new Error("upstream error");
        },
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      quarantinedPath: path.join(dir, "_failed", "meeting.json"),
    });
    expect(await fileExists(path.join(dir, "_failed", "meeting.error.log"))).toBe(false);
  });

  test("does not quarantine when move_failed is false", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () => {
        throw new Error("llm error");
      },
    };

    const config = {
      ...baseConfig(dir),
      failure: { ...baseConfig(dir).failure, move_failed: false },
    };
    const result = await processTranscriptFile(jsonPath, config, { llmClient });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.quarantinedPath).toBeUndefined();
    }
    expect(await fileExists(jsonPath)).toBe(true);
    expect(await fileExists(path.join(dir, "_failed", "meeting.json"))).toBe(false);
  });

  test("uses timestamped path when quarantine target already exists", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    // Pre-create the expected quarantine target to force timestamp collision path
    await mkdir(path.join(dir, "_failed"), { recursive: true });
    await writeFile(path.join(dir, "_failed", "meeting.json"), "existing", "utf8");

    const llmClient: LlmClient = {
      generate: async () => {
        throw new Error("upstream error");
      },
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.quarantinedPath).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(await readFile(result.quarantinedPath!, "utf8")).toBe(
        JSON.stringify({ segments: [{ text: "hello" }] }),
      );
    }
    expect(await readFile(path.join(dir, "_failed", "meeting.json"), "utf8")).toBe("existing");
  });

  test("returns failed gracefully when quarantine itself throws", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    // Pre-create _failed as a file so mkdir throws ENOTDIR
    await writeFile(path.join(dir, "_failed"), "blocker", "utf8");

    const llmClient: LlmClient = {
      generate: async () => {
        throw new Error("upstream error");
      },
    };

    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.errorMessage).toBe("upstream error");
        expect(result.quarantinedPath).toBeUndefined();
        expect(result.errorLogPath).toBeUndefined();
      }
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("quarantine failed"));
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("processTranscriptFile - multi-step chaining", () => {
  function twoStepConfig(rootDir: string): ResolvedTranscriberConfig {
    return {
      ...baseConfig(rootDir),
      steps: [
        { name: "clean", prompt: "clean the transcript", suffix: ".cleaned.md" },
        { name: "summarize", prompt: "summarize it", suffix: ".summary.md" },
      ],
    };
  }

  test("two-step chain writes both files and feeds first output to second call", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const calls: Array<{ prompt: string; input: string }> = [];
    const llmClient: LlmClient = {
      generate: async (prompt, input) => {
        calls.push({ prompt, input });
        if (prompt === "clean the transcript") return "cleaned output";
        if (prompt === "summarize it") return "summary output";
        return "unknown";
      },
    };

    const result = await processTranscriptFile(jsonPath, twoStepConfig(dir), { llmClient });
    expect(result.status).toBe("success");

    const cleanedPath = path.join(dir, "meeting.cleaned.md");
    const summaryPath = path.join(dir, "meeting.summary.md");
    expect(await fileExists(cleanedPath)).toBe(true);
    expect(await fileExists(summaryPath)).toBe(true);

    // verify step 2 received step 1's output as its input
    expect(calls).toHaveLength(2);
    expect(calls[0]!.prompt).toBe("clean the transcript");
    expect(calls[1]!.prompt).toBe("summarize it");
    expect(calls[1]!.input).toBe("cleaned output");

    if (result.status === "success") {
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults![0]!.stepName).toBe("clean");
      expect(result.stepResults![1]!.stepName).toBe("summarize");
      // markdownPath should be the last step's output
      expect(result.markdownPath).toBe(summaryPath);
    }
  });

  test("skips when all outputs already exist", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");
    await writeFile(path.join(dir, "meeting.cleaned.md"), "existing clean", "utf8");
    await writeFile(path.join(dir, "meeting.summary.md"), "existing summary", "utf8");

    let called = false;
    const llmClient: LlmClient = {
      generate: async () => {
        called = true;
        return "should not run";
      },
    };

    const result = await processTranscriptFile(jsonPath, twoStepConfig(dir), { llmClient });
    expect(result.status).toBe("skipped");
    expect(called).toBe(false);
  });

  test("partial skip: first output exists, only second LLM call fires", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ speaker: "A", text: "hi" }] }), "utf8");
    // pre-write step 1's output
    await writeFile(path.join(dir, "meeting.cleaned.md"), "cached clean output", "utf8");

    const calls: Array<{ prompt: string; input: string }> = [];
    const llmClient: LlmClient = {
      generate: async (prompt, input) => {
        calls.push({ prompt, input });
        return "fresh summary";
      },
    };

    const result = await processTranscriptFile(jsonPath, twoStepConfig(dir), { llmClient });
    expect(result.status).toBe("success");

    // only step 2 should have called LLM
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toBe("summarize it");
    // step 2's input should be the cached content from disk
    expect(calls[0]!.input).toBe("cached clean output");

    const summaryPath = path.join(dir, "meeting.summary.md");
    expect(await fileExists(summaryPath)).toBe(true);
  });

  test("error in step 2 includes failedStep name, step 1 output remains", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async (prompt) => {
        if (prompt === "clean the transcript") return "cleaned";
        throw new Error("step 2 exploded");
      },
    };

    const result = await processTranscriptFile(jsonPath, twoStepConfig(dir), { llmClient });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failedStep).toBe("summarize");
      expect(result.errorMessage).toBe("step 2 exploded");
    }

    // step 1 output should still be on disk
    expect(await fileExists(path.join(dir, "meeting.cleaned.md"))).toBe(true);
  });

  test("processes a .vtt file using VTT parser", async () => {
    const dir = await makeTempDir();
    const vttPath = path.join(dir, "meeting.vtt");
    const vttContent = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:03.000",
      "<v Alice>Hello everyone.</v>",
      "",
      "2",
      "00:00:03.500 --> 00:00:06.000",
      "<v Bob>Hi Alice, let's get started.</v>",
    ].join("\n");
    await writeFile(vttPath, vttContent, "utf8");

    const llmClient: LlmClient = {
      generate: async (_prompt, input) => {
        // The input should contain the rendered transcript from VTT
        expect(input).toContain("Alice: Hello everyone.");
        expect(input).toContain("Bob: Hi Alice, let's get started.");
        return "---\ndate: 2026-02-27\n---\n## Summary\nA meeting.\n## Decisions\n- none\n## Action Items\n- [ ] follow up\n## Notes\nAlice: Hello everyone.";
      },
    };

    const config = baseConfig(dir);
    const result = await processTranscriptFile(vttPath, config, { llmClient });
    expect(result.status).toBe("success");

    const mdPath = path.join(dir, "meeting.md");
    expect(await fileExists(mdPath)).toBe(true);
  });

  test("per-step llm overrides are merged with global config", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const capturedConfigs: Array<Record<string, unknown>> = [];
    const llmClient: LlmClient = {
      generate: async (_prompt, _input, llmConfig) => {
        capturedConfigs.push({ ...llmConfig });
        return "output";
      },
    };

    const config: ResolvedTranscriberConfig = {
      ...baseConfig(dir),
      steps: [
        {
          name: "clean",
          prompt: "clean it",
          suffix: ".cleaned.md",
          llm: { model: "gpt-4o", temperature: 0.9 },
        },
      ],
    };

    await processTranscriptFile(jsonPath, config, { llmClient });
    expect(capturedConfigs).toHaveLength(1);
    expect(capturedConfigs[0]!.model).toBe("gpt-4o");
    expect(capturedConfigs[0]!.temperature).toBe(0.9);
    // other fields come from global config
    expect(capturedConfigs[0]!.retries).toBe(1);
  });
});

const SIMPLE_LLM_OUTPUT =
  "---\ndate: 2026-03-20\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
const simpleLlm: LlmClient = { generate: async () => SIMPLE_LLM_OUTPUT };

describe("copy_to failures do not quarantine a successful transcription", () => {
  test("a broken copy_to leaves the source in place and still reports success", async () => {
    const dir = await makeTempDir();
    const vaultParent = await makeTempDir();
    // copy_to points at an existing *file*, so mkdir fails with ENOTDIR
    const notADir = path.join(vaultParent, "not-a-dir");
    await writeFile(notADir, "x", "utf8");

    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const base = baseConfig(dir);
    const config: ResolvedTranscriberConfig = {
      ...base,
      output: { ...base.output, copy_to: notADir },
    };

    const result = await processTranscriptFile(jsonPath, config, { llmClient: simpleLlm });

    expect(result.status).toBe("success");
    expect(await fileExists(jsonPath)).toBe(true);
    expect(await fileExists(path.join(dir, "_failed", "meeting.json"))).toBe(false);
    expect(await fileExists(path.join(dir, "meeting.md"))).toBe(true);
  });
});

describe("stripOuterCodeFence", () => {
  test("strips a fenced markdown block wrapping the whole response", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () => "```markdown\n" + SIMPLE_LLM_OUTPUT + "\n```",
    };
    await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });

    const md = await readFile(path.join(dir, "meeting.md"), "utf8");
    expect(md.startsWith("---")).toBe(true);
    expect(md.includes("```")).toBe(false);
  });
});

describe("copyOutput collision", () => {
  test("warns before overwriting an existing copy target", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-07-20 standup.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");
    const destPath = path.join(vaultDir, "2026-07-20 standup.md");
    await writeFile(destPath, "older copy", "utf8");

    const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir), { llmClient: simpleLlm });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("copy target already exists"));
    } finally {
      warnSpy.mockRestore();
    }
    expect(await readFile(destPath, "utf8")).toBe(SIMPLE_LLM_OUTPUT);
  });
});

describe("stripDateFromStem - separator handling", () => {
  test("keeps the original stem when the filename is only a date", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-07-20.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir), { llmClient: simpleLlm });

    expect(await fileExists(path.join(vaultDir, "2026-07-20 2026-07-20.md"))).toBe(true);
  });

  test("strips leading date with underscore separator", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const vttPath = path.join(dir, "2026-03-20_weekly-standup.vtt");
    await writeFile(
      vttPath,
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Alice>Hello.</v>",
      "utf8",
    );

    const base = copyConfig(dir, vaultDir);
    const config = { ...base, watch: { ...base.watch, include_glob: "**/*.{json,vtt}" } };
    await processTranscriptFile(vttPath, config, { llmClient: simpleLlm });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 weekly-standup.md"))).toBe(true);
  });

  test("strips leading date with hyphen separator", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-03-20-team-sync.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir), { llmClient: simpleLlm });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 team-sync.md"))).toBe(true);
  });

  test("strips trailing date with underscore separator", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "team_sync_2026-03-10.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const llmOutput =
      "---\ndate: 2026-03-10\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir), {
      llmClient: { generate: async () => llmOutput },
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-10 team_sync.md"))).toBe(true);
  });
});

describe("copy_filename template", () => {
  const TITLED_OUTPUT =
    "---\ntitle: Weekly Standup\ndate: 2026-03-20\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhello";
  const titledLlm: LlmClient = { generate: async () => TITLED_OUTPUT };

  async function writeTestJson(dir: string, name: string): Promise<string> {
    const p = path.join(dir, name);
    await writeFile(p, JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }), "utf8");
    return p;
  }

  test("resolves {{date}} {{title}} from front matter", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{date}} {{title}}"), {
      llmClient: titledLlm,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 Weekly Standup.md"))).toBe(true);
  });

  test("{{title}} falls back to {{stem}} when markdown has no front matter", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    const llmClient: LlmClient = { generate: async () => "## Summary\nJust plain markdown." };
    // {{title}} alone: default naming could never produce this filename, so the template
    // path really did run.
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{title}}"), {
      llmClient,
    });

    expect(await fileExists(path.join(vaultDir, "weekly-standup.md"))).toBe(true);
  });

  test("config validation rejects unknown variables", () => {
    const result = OutputConfigSchema.safeParse({ copy_filename: "{{date}} {{foo}}" });
    expect(result.success).toBe(false);
  });

  test("config validation rejects empty copy_filename", () => {
    const result = OutputConfigSchema.safeParse({ copy_filename: "" });
    expect(result.success).toBe(false);
  });

  test("sanitizes filesystem-invalid characters in resolved filename", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_meeting.json");

    const llmClient: LlmClient = {
      generate: async () => '---\ntitle: "Q1: Planning"\ndate: 2026-03-20\n---\n## Summary\nx',
    };
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{date}} {{title}}"), {
      llmClient,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 Q1- Planning.md"))).toBe(true);
  });

  test("{{title}} falls back to {{stem}} when front matter has empty title", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    const llmClient: LlmClient = {
      generate: async () => '---\ntitle: ""\ndate: 2026-03-20\n---\n## Summary\nx',
    };
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{date}} {{title}}"), {
      llmClient,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 weekly-standup.md"))).toBe(true);
  });

  test("{{title}} falls back to {{stem}} when front matter YAML is malformed", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    const llmClient: LlmClient = {
      generate: async () => "---\n: invalid: yaml: [unclosed\n---\n## Summary\nx",
    };
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{date}} {{title}}"), {
      llmClient,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 weekly-standup.md"))).toBe(true);
  });

  test("template with .MD extension (case-insensitive) does not produce double extension", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{date}} {{title}}.MD"), {
      llmClient: titledLlm,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 Weekly Standup.MD"))).toBe(true);
    expect(await fileExists(path.join(vaultDir, "2026-03-20 Weekly Standup.MD.md"))).toBe(false);
  });

  test("template resolving to all-invalid characters falls back to default naming", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = await writeTestJson(dir, "2026-03-20_weekly-standup.json");

    const llmClient: LlmClient = {
      generate: async () => '---\ntitle: "***"\ndate: 2026-03-20\n---\n## Summary\nx',
    };
    await processTranscriptFile(jsonPath, copyConfig(dir, vaultDir, "{{title}}"), {
      llmClient,
    });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 weekly-standup.md"))).toBe(true);
  });
});

describe("applyStemStrip", () => {
  test("single pattern strips matching suffix", () => {
    expect(applyStemStrip("weekly-standup_36f1f8", "_[a-f0-9]{4,8}$")).toBe("weekly-standup");
  });

  test("array of patterns applied sequentially", () => {
    expect(applyStemStrip("weekly-standup_36f1f8-copy", ["_[a-f0-9]{4,8}", "-copy$"])).toBe(
      "weekly-standup",
    );
  });

  test("unanchored pattern removes all occurrences", () => {
    expect(applyStemStrip("a_copy_b_copy", "_copy")).toBe("a_b");
  });

  test("no match leaves stem unchanged", () => {
    expect(applyStemStrip("weekly-standup", "_[a-f0-9]{4,8}$")).toBe("weekly-standup");
  });

  test("empty result after strip falls back to original", () => {
    expect(applyStemStrip("abc123", "^[a-z0-9]+$")).toBe("abc123");
  });
});

describe("stem_strip schema validation", () => {
  test("accepts stem_strip as string", () => {
    const result = OutputConfigSchema.safeParse({ stem_strip: "_[a-f0-9]{4,8}$" });
    expect(result.success).toBe(true);
  });

  test("accepts stem_strip as array of strings", () => {
    const result = OutputConfigSchema.safeParse({
      stem_strip: ["_[a-f0-9]{4,8}$", "-copy$"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid regex in stem_strip", () => {
    const result = OutputConfigSchema.safeParse({ stem_strip: "[invalid(" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid regex in stem_strip array", () => {
    const result = OutputConfigSchema.safeParse({
      stem_strip: ["valid", "[invalid("],
    });
    expect(result.success).toBe(false);
  });
});

describe("stem_strip integration", () => {
  test("stem_strip with copy_filename template", async () => {
    const dir = await makeTempDir();
    const vaultDir = await makeTempDir();
    const jsonPath = path.join(dir, "2026-03-20_team-sync_dd1971.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ segments: [{ speaker: "A", text: "hello" }] }),
      "utf8",
    );

    const base = copyConfig(dir, vaultDir, "{{date}} {{stem}}");
    const config: ResolvedTranscriberConfig = {
      ...base,
      output: { ...base.output, stem_strip: "_[a-f0-9]{4,8}$" },
    };
    await processTranscriptFile(jsonPath, config, { llmClient: simpleLlm });

    expect(await fileExists(path.join(vaultDir, "2026-03-20 team-sync.md"))).toBe(true);
  });
});
