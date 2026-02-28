import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createFileFilter } from "../src/file-filter";
import type { TranscriberConfig } from "../src/schemas";

function makeConfig(
  rootDir: string,
  overrides?: Partial<TranscriberConfig["watch"]>,
): TranscriberConfig {
  return {
    watch: {
      root_dir: rootDir,
      stable_window_ms: 3000,
      include_glob: "**/*.{json,vtt}",
      exclude_glob: ["**/_failed/**"],
      ...overrides,
    },
    output: { markdown_suffix: ".md", overwrite: false },
    failure: { move_failed: true, failed_dir_name: "_failed", write_error_log: true },
    llm: {
      base_url: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      temperature: 0.1,
      max_tokens: 3000,
      timeout_ms: 1000,
      retries: 1,
    },
    transcript: { path: "$.segments[*]" },
    steps: [{ name: "default", prompt: "p", notify: false }],
  } as TranscriberConfig;
}

describe("createFileFilter", () => {
  const root = "/tmp/watch";

  test("accepts .json files", () => {
    const filter = createFileFilter(makeConfig(root));
    expect(filter(path.join(root, "meeting.json"))).toBe(true);
  });

  test("accepts .vtt files", () => {
    const filter = createFileFilter(makeConfig(root));
    expect(filter(path.join(root, "meeting.vtt"))).toBe(true);
  });

  test("rejects .txt files", () => {
    const filter = createFileFilter(makeConfig(root));
    expect(filter(path.join(root, "notes.txt"))).toBe(false);
  });

  test("rejects files outside root", () => {
    const filter = createFileFilter(makeConfig(root));
    expect(filter("/other/dir/meeting.json")).toBe(false);
  });

  test("rejects files in failed directory", () => {
    const filter = createFileFilter(makeConfig(root));
    expect(filter(path.join(root, "_failed", "bad.json"))).toBe(false);
  });

  test("applies exclude globs", () => {
    const filter = createFileFilter(makeConfig(root, { exclude_glob: ["**/draft-*"] }));
    expect(filter(path.join(root, "draft-meeting.json"))).toBe(false);
  });

  test("applies include glob", () => {
    const filter = createFileFilter(makeConfig(root, { include_glob: "**/keep-*.json" }));
    expect(filter(path.join(root, "keep-a.json"))).toBe(true);
    expect(filter(path.join(root, "other.json"))).toBe(false);
  });

  test("rejects .VTT when include glob only matches lowercase", () => {
    const filter = createFileFilter(makeConfig(root));
    // The default include glob is **/*.{json,vtt} which is case-sensitive
    expect(filter(path.join(root, "meeting.VTT"))).toBe(false);
  });

  test("accepts .VTT when include glob covers uppercase", () => {
    const filter = createFileFilter(makeConfig(root, { include_glob: "**/*.{json,vtt,VTT}" }));
    expect(filter(path.join(root, "meeting.VTT"))).toBe(true);
  });
});
