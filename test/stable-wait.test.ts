import { describe, expect, mock, spyOn, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { installTempDirCleanup, makeTempDir } from "./helpers";

const sleep = mock(async (_ms: number) => {});

mock.module("../src/sleep", () => ({
  sleep,
}));

const { waitForStableFile } = await import("../src/stable-wait");

installTempDirCleanup();

describe("waitForStableFile", () => {
  test("restarts the stability window when the file changes", async () => {
    const dir = await makeTempDir();
    const filePath = `${dir}/stable.vtt`;
    await writeFile(filePath, "WEBVTT\n\nhello", "utf8");
    let now = 0;

    const dateNow = spyOn(Date, "now").mockImplementation(() => now);
    sleep.mockImplementation(async () => {
      now += 100;
      if (sleep.mock.calls.length === 2) {
        await writeFile(filePath, "WEBVTT\n\nhello world", "utf8");
      }
    });

    try {
      await expect(waitForStableFile(filePath, 100, 50)).resolves.toBeUndefined();
      expect(sleep).toHaveBeenCalledTimes(4);
    } finally {
      dateNow.mockRestore();
      sleep.mockReset();
    }
  });
});
