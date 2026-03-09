import { describe, expect, mock, test } from "bun:test";
import { helpText, parseArgs } from "../src/index";
import pkg from "../package.json";

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

  test("parses --version flag", () => {
    const args = parseArgs(["--version"]);
    expect(args.command).toBe("version");
  });

  test("parses -v flag", () => {
    const args = parseArgs(["-v"]);
    expect(args.command).toBe("version");
  });
});

describe("helpText", () => {
  test("contains init and help usage", () => {
    const text = helpText();
    expect(text).toContain("init");
    expect(text).toContain("--help");
    expect(text).toContain("--debug");
    expect(text).toContain("--version");
  });
});

describe("main --version", () => {
  test("prints the package version to stdout", async () => {
    const { main } = await import("../src/index");
    const logSpy = mock();
    const origLog = console.log;
    console.log = logSpy;
    try {
      await main(["--version"]);
    } finally {
      console.log = origLog;
    }
    expect(logSpy).toHaveBeenCalledWith(`cassette v${pkg.version}`);
  });
});

describe("startup version log", () => {
  test("logs version at startup for run command", async () => {
    const { logger } = await import("../src/logger");
    const infoSpy = mock();
    const origInfo = logger.info;
    logger.info = infoSpy;
    try {
      const { main } = await import("../src/index");
      // This will fail because no config exists, but version should be logged before config loading
      await main([]).catch(() => {});
    } finally {
      logger.info = origInfo;
    }
    const calls = infoSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((msg) => msg.includes(pkg.version))).toBe(true);
  });
});
