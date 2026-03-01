import { afterEach, beforeEach, describe, expect, test, spyOn } from "bun:test";
import { logger } from "../src/logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    logger.setLevel("info");
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    logger.setLevel("silent");
  });

  test("debug is suppressed at info level", () => {
    logger.debug("hidden message");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("info, warn, error all appear at info level", () => {
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  test("debug and info route to console.log", () => {
    logger.setLevel("debug");
    logger.debug("dbg");
    logger.info("inf");
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("warn and error route to console.error", () => {
    logger.warn("w");
    logger.error("e");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("silent level suppresses all", () => {
    logger.setLevel("silent");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("setLevel changes behavior dynamically", () => {
    logger.debug("should not appear");
    expect(logSpy).not.toHaveBeenCalled();

    logger.setLevel("debug");
    logger.debug("should appear");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  test("output contains the message", () => {
    logger.info("hello world");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("hello world");
    expect(output).toContain("INFO");
  });
});
