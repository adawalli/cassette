import { describe, expect, test } from "bun:test";
import { helpText, parseArgs } from "../src/index";

describe("parseArgs", () => {
  test("parses help flag without requiring config", () => {
    const args = parseArgs(["--help"]);
    expect(args.command).toBe("help");
  });

  test("parses init command with force and config path", () => {
    const args = parseArgs(["init", "--force", "--config", "/tmp/config.yaml"]);
    expect(args.command).toBe("init");
    expect(args.force).toBe(true);
    expect(args.configPath).toBe("/tmp/config.yaml");
  });

  test("parses default run options", () => {
    const args = parseArgs(["--once", "--debug"]);
    expect(args.command).toBe("run");
    expect(args.once).toBe(true);
    expect(args.debug).toBe(true);
  });
});

describe("helpText", () => {
  test("contains init and help usage", () => {
    const text = helpText();
    expect(text).toContain("init");
    expect(text).toContain("--help");
    expect(text).toContain("--debug");
  });
});
