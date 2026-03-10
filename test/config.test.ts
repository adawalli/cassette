import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_CONFIG_YAML,
  initConfigFile,
  loadConfig,
  normalizeSteps,
  resolveConfigPath,
} from "../src/config";
import { OnCompleteConfigSchema, TranscriberConfigSchema } from "../src/schemas";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cassette-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveConfigPath", () => {
  test("uses XDG_CONFIG_HOME when set", () => {
    const result = resolveConfigPath({
      XDG_CONFIG_HOME: "/tmp/myxdg",
      HOME: "/Users/example",
    } as NodeJS.ProcessEnv);
    expect(result).toBe("/tmp/myxdg/cassette/config.yaml");
  });

  test("falls back to HOME/.config", () => {
    const result = resolveConfigPath({
      HOME: "/Users/example",
    } as NodeJS.ProcessEnv);
    expect(result).toBe("/Users/example/.config/cassette/config.yaml");
  });
});

describe("loadConfig", () => {
  test("applies defaults from schema", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      [
        "watch:",
        "  root_dir: /tmp/meetings",
        "transcript:",
        "  path: $.items[*]",
        "prompt: hello",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    expect(config.watch.stable_window_ms).toBe(3000);
    expect(config.output.markdown_suffix).toBe(".md");
    expect(config.failure.failed_dir_name).toBe("_failed");
    expect(config.llm.retries).toBe(5);
  });

  test("throws on invalid schema", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(configPath, "watch:\n  root_dir: /tmp\nprompt: x\n", "utf8");
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  test("supports loading from XDG default location", async () => {
    const dir = await makeTempDir();
    const configRoot = path.join(dir, "xdg");
    const configDir = path.join(configRoot, "cassette");
    await mkdir(configDir, { recursive: true });
    const defaultPath = path.join(configDir, "config.yaml");
    await writeFile(
      defaultPath,
      ["watch:", `  root_dir: ${dir}`, "transcript:", "  path: $.rows[*]", "prompt: hi"].join("\n"),
      "utf8",
    );

    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = configRoot;
    try {
      const loaded = await loadConfig();
      expect(loaded.watch.root_dir).toBe(dir);
    } finally {
      if (originalXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdg;
      }
    }
  });
});

describe("loadConfig tilde expansion", () => {
  test("expands tilde in root_dir", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      [
        "watch:",
        "  root_dir: ~/Documents/meetings",
        "transcript:",
        "  path: $.items[*]",
        "prompt: hello",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    expect(config.watch.root_dir).not.toContain("~");
    expect(config.watch.root_dir).toBe(path.join(os.homedir(), "Documents/meetings"));
  });

  test("leaves absolute root_dir unchanged", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      [
        "watch:",
        "  root_dir: /tmp/meetings",
        "transcript:",
        "  path: $.items[*]",
        "prompt: hello",
      ].join("\n"),
      "utf8",
    );

    const config = await loadConfig(configPath);
    expect(config.watch.root_dir).toBe("/tmp/meetings");
  });

  test("expands tilde-only root_dir passed as string", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    // Use quoted "~" to prevent YAML from parsing it as null
    await writeFile(
      configPath,
      ["watch:", '  root_dir: "~"', "transcript:", "  path: $.items[*]", "prompt: hello"].join(
        "\n",
      ),
      "utf8",
    );

    const config = await loadConfig(configPath);
    expect(config.watch.root_dir).toBe(os.homedir());
  });
});

describe("normalizeSteps", () => {
  function makeBase() {
    return TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      prompt: "clean this",
    });
  }

  test("bare prompt converts to single-step array with name 'default'", () => {
    const config = makeBase();
    const resolved = normalizeSteps(config);
    expect(resolved.steps).toHaveLength(1);
    expect(resolved.steps[0].name).toBe("default");
    expect(resolved.steps[0].prompt).toBe("clean this");
    expect("prompt" in resolved).toBe(false);
  });

  test("steps array passes through unchanged", () => {
    const config = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [
        { name: "clean", prompt: "clean it", suffix: ".cleaned.md" },
        { name: "summarize", prompt: "summarize it", suffix: ".summary.md" },
      ],
    });
    const resolved = normalizeSteps(config);
    expect(resolved.steps).toHaveLength(2);
    expect(resolved.steps[0].name).toBe("clean");
    expect(resolved.steps[1].name).toBe("summarize");
  });

  test("duplicate suffix across steps throws", () => {
    const config = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [
        { name: "first", prompt: "do first", suffix: ".cleaned.md" },
        { name: "second", prompt: "do second", suffix: ".cleaned.md" },
      ],
    });
    expect(() => normalizeSteps(config)).toThrow("Duplicate step suffix");
  });

  test("two steps both omitting suffix (using default) throws", () => {
    const config = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [
        { name: "first", prompt: "do first" },
        { name: "second", prompt: "do second" },
      ],
    });
    expect(() => normalizeSteps(config)).toThrow("Duplicate step suffix");
  });

  test("per-step llm overrides are preserved", () => {
    const config = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [{ name: "clean", prompt: "clean it", llm: { model: "gpt-4o", temperature: 0.5 } }],
    });
    const resolved = normalizeSteps(config);
    expect(resolved.steps[0].llm?.model).toBe("gpt-4o");
    expect(resolved.steps[0].llm?.temperature).toBe(0.5);
  });
});

describe("schema validation - prompt/steps mutual exclusion", () => {
  const base = {
    watch: { root_dir: "/tmp/meetings" },
    transcript: { path: "$.segments[*]" },
  };

  test("both prompt and steps present throws", () => {
    expect(() =>
      TranscriberConfigSchema.parse({
        ...base,
        prompt: "a prompt",
        steps: [{ name: "s", prompt: "step prompt" }],
      }),
    ).toThrow();
  });

  test("neither prompt nor steps present throws", () => {
    expect(() => TranscriberConfigSchema.parse(base)).toThrow();
  });

  test("only prompt is valid", () => {
    expect(() => TranscriberConfigSchema.parse({ ...base, prompt: "just a prompt" })).not.toThrow();
  });

  test("only steps is valid", () => {
    expect(() =>
      TranscriberConfigSchema.parse({
        ...base,
        steps: [{ name: "s", prompt: "step prompt" }],
      }),
    ).not.toThrow();
  });
});

describe("loadConfig normalization", () => {
  test("bare prompt config normalizes to steps array", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      [
        "watch:",
        "  root_dir: /tmp/meetings",
        "transcript:",
        "  path: $.items[*]",
        "prompt: hello",
      ].join("\n"),
      "utf8",
    );
    const config = await loadConfig(configPath);
    expect(config.steps).toHaveLength(1);
    expect(config.steps[0].name).toBe("default");
    expect(config.steps[0].prompt).toBe("hello");
    expect("prompt" in config).toBe(false);
  });

  test("steps config loads correctly", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      [
        "watch:",
        "  root_dir: /tmp/meetings",
        "transcript:",
        "  path: $.items[*]",
        "steps:",
        "  - name: clean",
        "    prompt: clean the transcript",
        "    suffix: .cleaned.md",
        "  - name: summarize",
        "    prompt: summarize it",
        "    suffix: .summary.md",
      ].join("\n"),
      "utf8",
    );
    const config = await loadConfig(configPath);
    expect(config.steps).toHaveLength(2);
    expect(config.steps[0].suffix).toBe(".cleaned.md");
    expect(config.steps[1].suffix).toBe(".summary.md");
  });
});

describe("on_complete schema", () => {
  test("validates and applies timeout_ms default", () => {
    const result = OnCompleteConfigSchema.parse({ command: "echo done" });
    expect(result.command).toBe("echo done");
    expect(result.timeout_ms).toBe(10000);
  });

  test("accepts explicit timeout_ms", () => {
    const result = OnCompleteConfigSchema.parse({ command: "echo done", timeout_ms: 5000 });
    expect(result.timeout_ms).toBe(5000);
  });

  test("rejects empty command", () => {
    expect(() => OnCompleteConfigSchema.parse({ command: "" })).toThrow();
  });

  test("on_complete is optional in TranscriberConfigSchema", () => {
    expect(() =>
      TranscriberConfigSchema.parse({
        watch: { root_dir: "/tmp/meetings" },
        transcript: { path: "$.segments[*]" },
        prompt: "clean this",
      }),
    ).not.toThrow();
  });

  test("on_complete is accepted in TranscriberConfigSchema", () => {
    const result = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      prompt: "clean this",
      on_complete: { command: "echo done" },
    });
    expect(result.on_complete?.command).toBe("echo done");
    expect(result.on_complete?.timeout_ms).toBe(10000);
  });
});

describe("step notify field", () => {
  test("notify defaults to false", () => {
    const result = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [{ name: "clean", prompt: "clean it" }],
    });
    expect(result.steps?.[0]?.notify).toBe(false);
  });

  test("notify: true is preserved", () => {
    const result = TranscriberConfigSchema.parse({
      watch: { root_dir: "/tmp/meetings" },
      transcript: { path: "$.segments[*]" },
      steps: [{ name: "clean", prompt: "clean it", notify: true }],
    });
    expect(result.steps?.[0]?.notify).toBe(true);
  });
});

describe("initConfigFile", () => {
  test("creates a new config file", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "cassette", "config.yaml");
    const result = await initConfigFile(configPath);
    expect(result).toBe("created");
    const content = await readFile(configPath, "utf8");
    expect(content).toContain("watch:");
    expect(content).toContain("prompt:");
  });

  test("does not overwrite existing config unless forced", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.yaml");
    await writeFile(
      configPath,
      "prompt: custom\nwatch:\n  root_dir: /tmp\ntranscript:\n  path: $.x\n",
      "utf8",
    );

    const first = await initConfigFile(configPath);
    expect(first).toBe("exists");
    const untouched = await readFile(configPath, "utf8");
    expect(untouched).toContain("custom");

    const second = await initConfigFile(configPath, { force: true });
    expect(second).toBe("overwritten");
    const overwritten = await readFile(configPath, "utf8");
    expect(overwritten).toBe(DEFAULT_CONFIG_YAML);
  });
});
