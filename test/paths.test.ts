import { describe, expect, test } from "bun:test";
import { markdownPathFor, isJsonPath, isVttPath, isInFailedDirectory } from "../src/paths";

describe("markdownPathFor", () => {
  test("strips .json and appends suffix", () => {
    expect(markdownPathFor("/tmp/meeting.json", ".md")).toBe("/tmp/meeting.md");
  });

  test("strips .JSON (case-insensitive)", () => {
    expect(markdownPathFor("/tmp/meeting.JSON", ".md")).toBe("/tmp/meeting.md");
  });

  test("strips .vtt and appends suffix", () => {
    expect(markdownPathFor("/tmp/meeting.vtt", ".md")).toBe("/tmp/meeting.md");
  });

  test("strips .VTT (case-insensitive)", () => {
    expect(markdownPathFor("/tmp/meeting.VTT", ".md")).toBe("/tmp/meeting.md");
  });

  test("appends suffix when extension is unknown", () => {
    expect(markdownPathFor("/tmp/meeting.txt", ".md")).toBe("/tmp/meeting.txt.md");
  });
});

describe("isJsonPath", () => {
  test("returns true for .json", () => {
    expect(isJsonPath("/tmp/a.json")).toBe(true);
  });

  test("returns true for .JSON", () => {
    expect(isJsonPath("/tmp/a.JSON")).toBe(true);
  });

  test("returns false for .vtt", () => {
    expect(isJsonPath("/tmp/a.vtt")).toBe(false);
  });
});

describe("isVttPath", () => {
  test("returns true for .vtt", () => {
    expect(isVttPath("/tmp/a.vtt")).toBe(true);
  });

  test("returns true for .VTT", () => {
    expect(isVttPath("/tmp/a.VTT")).toBe(true);
  });

  test("returns false for .json", () => {
    expect(isVttPath("/tmp/a.json")).toBe(false);
  });
});

describe("isInFailedDirectory", () => {
  test("returns true when path contains failed dir", () => {
    expect(isInFailedDirectory("/tmp/_failed/a.json", "_failed")).toBe(true);
  });

  test("returns false when path does not contain failed dir", () => {
    expect(isInFailedDirectory("/tmp/meetings/a.json", "_failed")).toBe(false);
  });
});
