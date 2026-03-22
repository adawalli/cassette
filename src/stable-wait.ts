import { stat } from "node:fs/promises";
import { sleep } from "./sleep";

export async function waitForStableFile(
  filePath: string,
  stableWindowMs: number,
  pollMs = 250,
): Promise<void> {
  let stableSince = 0;
  let previousSignature = "";

  while (true) {
    const info = await stat(filePath);
    const signature = `${info.size}:${info.mtimeMs}`;
    if (signature === previousSignature) {
      if (stableSince === 0) {
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= stableWindowMs) {
        return;
      }
    } else {
      previousSignature = signature;
      stableSince = 0;
    }
    await sleep(Math.max(50, pollMs));
  }
}
