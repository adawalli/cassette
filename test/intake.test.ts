import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { intakeFile, scanIntakeFiles, weekDir } from "../src/intake";
import { IntakeConfigSchema, TranscriberConfigSchema } from "../src/schemas";
import type { ResolvedTranscriberConfig } from "../src/schemas";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cassette-intake-"));
  tempDirs.push(dir);
  return dir;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function makeConfig(
  rootDir: string,
  sourceDir: string,
  overrides?: Partial<{ delete_source: boolean; include_glob: string; exclude_glob: string[] }>,
): ResolvedTranscriberConfig {
  return {
    watch: {
      root_dir: rootDir,
      stable_window_ms: 50,
      include_glob: "**/*.{json,vtt}",
      exclude_glob: ["**/_failed/**"],
    },
    output: {
      markdown_suffix: ".md",
      overwrite: false,
    },
    failure: {
      move_failed: true,
      failed_dir_name: "_failed",
      write_error_log: true,
    },
    llm: {
      base_url: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      temperature: 0.1,
      max_tokens: 3000,
      timeout_ms: 1000,
      retries: 1,
    },
    transcript: {
      path: "$[*]",
      text_field: "text",
      speaker_field: "speaker",
    },
    steps: [{ name: "default", prompt: "prompt", notify: false }],
    intake: {
      source_dir: sourceDir,
      include_glob: overrides?.include_glob ?? "**/*.vtt",
      exclude_glob: overrides?.exclude_glob ?? [],
      delete_source: overrides?.delete_source ?? true,
    },
  };
}

// helper: relative path from rootDir for a dest path
function relFromRoot(rootDir: string, dest: string): string {
  return path.relative(rootDir, dest);
}

describe("weekDir", () => {
  test("Thursday returns Monday of same week", () => {
    // 2026-02-27 is a Thursday
    expect(weekDir(new Date(2026, 1, 27))).toBe(path.join("2026", "02-23"));
  });

  test("Monday returns itself", () => {
    expect(weekDir(new Date(2026, 1, 23))).toBe(path.join("2026", "02-23"));
  });

  test("Sunday returns previous Monday", () => {
    // 2026-03-01 is a Sunday
    expect(weekDir(new Date(2026, 2, 1))).toBe(path.join("2026", "02-23"));
  });
});

describe("intakeFile", () => {
  test("moves file into weekly subdirectory", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const srcFile = path.join(sourceDir, "meeting.vtt");
    await writeFile(srcFile, "WEBVTT\n\nhello", "utf8");

    const cfg = makeConfig(rootDir, sourceDir);
    const dest = await intakeFile(srcFile, cfg);

    // Should land in YYYY/MM-DD/ subdirectory
    const rel = relFromRoot(rootDir, dest);
    expect(rel).toMatch(/^\d{4}\/\d{2}-\d{2}\/meeting\.vtt$/);
    expect(await fileExists(dest)).toBe(true);
    expect(await fileExists(srcFile)).toBe(false);
    expect(await readFile(dest, "utf8")).toBe("WEBVTT\n\nhello");
  });

  test("copies file when delete_source is false", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    const srcFile = path.join(sourceDir, "meeting.vtt");
    await writeFile(srcFile, "WEBVTT\n\ncopy test", "utf8");

    const cfg = makeConfig(rootDir, sourceDir, { delete_source: false });
    const dest = await intakeFile(srcFile, cfg);

    const rel = relFromRoot(rootDir, dest);
    expect(rel).toMatch(/^\d{4}\/\d{2}-\d{2}\/meeting\.vtt$/);
    expect(await fileExists(dest)).toBe(true);
    expect(await fileExists(srcFile)).toBe(true);
    expect(await readFile(dest, "utf8")).toBe("WEBVTT\n\ncopy test");
  });

  test("handles collision with timestamp prefix", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();

    // Pre-create a file with the same name in the expected week subdir
    const week = weekDir(new Date());
    const weekPath = path.join(rootDir, week);
    await mkdir(weekPath, { recursive: true });
    await writeFile(path.join(weekPath, "meeting.vtt"), "existing", "utf8");

    const srcFile = path.join(sourceDir, "meeting.vtt");
    await writeFile(srcFile, "WEBVTT\n\nnew content", "utf8");

    const cfg = makeConfig(rootDir, sourceDir);
    const dest = await intakeFile(srcFile, cfg);

    expect(path.basename(dest)).toMatch(/^\d{4}-\d{2}-\d{2}T.*-meeting\.vtt$/);
    expect(await readFile(dest, "utf8")).toBe("WEBVTT\n\nnew content");
    expect(await readFile(path.join(weekPath, "meeting.vtt"), "utf8")).toBe("existing");
  });
});

describe("scanIntakeFiles", () => {
  test("only moves files matching include_glob", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    await writeFile(path.join(sourceDir, "meeting.vtt"), "WEBVTT\n\nhello", "utf8");
    await writeFile(path.join(sourceDir, "data.json"), "{}", "utf8");
    await writeFile(path.join(sourceDir, "notes.txt"), "notes", "utf8");

    const cfg = makeConfig(rootDir, sourceDir);
    const results = await scanIntakeFiles(cfg);

    expect(results).toHaveLength(1);
    expect(relFromRoot(rootDir, results[0]!)).toMatch(/^\d{4}\/\d{2}-\d{2}\/meeting\.vtt$/);
    // json and txt should remain in source
    expect(await fileExists(path.join(sourceDir, "data.json"))).toBe(true);
    expect(await fileExists(path.join(sourceDir, "notes.txt"))).toBe(true);
  });

  test("skips files matching exclude_glob", async () => {
    const sourceDir = await makeTempDir();
    const rootDir = await makeTempDir();
    await writeFile(path.join(sourceDir, "meeting.vtt"), "WEBVTT\n\nhello", "utf8");
    await mkdir(path.join(sourceDir, "archive"), { recursive: true });
    await writeFile(path.join(sourceDir, "archive", "old.vtt"), "WEBVTT\n\nold", "utf8");

    const cfg = makeConfig(rootDir, sourceDir, { exclude_glob: ["archive/**"] });
    const results = await scanIntakeFiles(cfg);

    expect(results).toHaveLength(1);
    expect(relFromRoot(rootDir, results[0]!)).toMatch(/^\d{4}\/\d{2}-\d{2}\/meeting\.vtt$/);
    expect(await fileExists(path.join(sourceDir, "archive", "old.vtt"))).toBe(true);
  });
});

describe("IntakeConfigSchema", () => {
  test("validates with defaults", () => {
    const result = IntakeConfigSchema.parse({ source_dir: "~/Downloads" });
    expect(result.source_dir).toBe("~/Downloads");
    expect(result.include_glob).toBe("**/*.vtt");
    expect(result.exclude_glob).toEqual([]);
    expect(result.delete_source).toBe(true);
  });

  test("optional intake in TranscriberConfigSchema", () => {
    const base = {
      watch: { root_dir: "/tmp/test" },
      transcript: { path: "$[*]" },
      prompt: "test prompt",
    };

    // Without intake - should parse fine
    const withoutIntake = TranscriberConfigSchema.parse(base);
    expect(withoutIntake.intake).toBeUndefined();

    // With intake
    const withIntake = TranscriberConfigSchema.parse({
      ...base,
      intake: { source_dir: "~/Downloads" },
    });
    expect(withIntake.intake).toBeDefined();
    expect(withIntake.intake!.source_dir).toBe("~/Downloads");
    expect(withIntake.intake!.include_glob).toBe("**/*.vtt");
  });
});
