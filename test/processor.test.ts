import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { processTranscriptFile } from "../src/processor";
import type { LlmClient } from "../src/llm";
import type { ResolvedTranscriberConfig } from "../src/schemas";
import { baseConfig, fileExists, installTempDirCleanup, makeTempDir } from "./helpers";

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

    const llmClient: LlmClient = {
      generate: async () =>
        [
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
        ].join("\n"),
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("success");

    const mdPath = path.join(dir, "meeting.md");
    expect(await fileExists(mdPath)).toBe(true);
    const md = await readFile(mdPath, "utf8");
    expect(md.includes("## Action Items")).toBe(true);
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

  test("returns warnings for weak markdown structure", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () => "plain content without required sections",
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.warnings.length).toBeGreaterThan(0);
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

  test("does not copy when copy_to is not set", async () => {
    const dir = await makeTempDir();
    const jsonPath = path.join(dir, "meeting.json");
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hi" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () =>
        "---\ndate: 2026-02-26\n---\n## Summary\nx\n## Decisions\n- d\n## Action Items\n- [ ] x\n## Notes\nhi",
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("success");
    // only the sibling .md should exist - no vault copy
    const files = await import("node:fs/promises").then((m) => m.readdir(dir));
    expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(1);
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
    await writeFile(jsonPath, JSON.stringify({ segments: [{ text: "hello" }] }), "utf8");

    const llmClient: LlmClient = {
      generate: async () => {
        throw new Error("upstream error");
      },
    };

    const result = await processTranscriptFile(jsonPath, baseConfig(dir), { llmClient });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorMessage).toBe("upstream error");
    }

    const failedJsonPath = path.join(dir, "_failed", "meeting.json");
    const errorLogPath = path.join(dir, "_failed", "meeting.error.log");
    expect(await fileExists(failedJsonPath)).toBe(true);
    expect(await fileExists(errorLogPath)).toBe(true);
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
    expect(calls[0].prompt).toBe("clean the transcript");
    expect(calls[1].prompt).toBe("summarize it");
    expect(calls[1].input).toBe("cleaned output");

    if (result.status === "success") {
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults![0].stepName).toBe("clean");
      expect(result.stepResults![1].stepName).toBe("summarize");
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
    expect(calls[0].prompt).toBe("summarize it");
    // step 2's input should be the cached content from disk
    expect(calls[0].input).toBe("cached clean output");

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
    expect(capturedConfigs[0].model).toBe("gpt-4o");
    expect(capturedConfigs[0].temperature).toBe(0.9);
    // other fields come from global config
    expect(capturedConfigs[0].retries).toBe(1);
  });
});
