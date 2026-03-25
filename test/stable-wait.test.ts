import { describe, expect, mock, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { installTempDirCleanup, makeTempDir } from "./helpers";

mock.module("../src/sleep", () => ({
  sleep: async () => {},
}));

const { waitForStableFile } = await import("../src/stable-wait");

installTempDirCleanup();

describe("waitForStableFile", () => {
  test("resolves once file size+mtime signature is stable across the window", async () => {
    const dir = await makeTempDir();
    const filePath = `${dir}/stable.vtt`;
    await writeFile(filePath, "WEBVTT\n\nhello", "utf8");

    // stableWindowMs = 0: resolves once the signature is unchanged across two consecutive polls
    await expect(waitForStableFile(filePath, 0, 50)).resolves.toBeUndefined();
  });
});
