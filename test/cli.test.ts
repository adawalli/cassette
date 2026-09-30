import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { helpText, parseArgs } from "../src/index";
import pkg from "../package.json";
import { installTempDirCleanup, makeTempDir } from "./helpers";

installTempDirCleanup();

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

  test("parses -V flag", () => {
    const args = parseArgs(["-V"]);
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
  test("logs version before reporting a configured missing config file", async () => {
    const configPath = path.join(await makeTempDir(), "missing.yaml");
    const { logger } = await import("../src/logger");
    const infoSpy = mock();
    const origInfo = logger.info;
    logger.info = infoSpy;
    try {
      const { main } = await import("../src/index");
      await expect(main(["--config", configPath])).rejects.toThrow(
        `Config not found at ${configPath}`,
      );
    } finally {
      logger.info = origInfo;
    }
    expect(infoSpy).toHaveBeenCalledWith(`cassette v${pkg.version}`);
  });
});
