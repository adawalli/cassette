import { spawn } from "node:child_process";
import { logger } from "./logger";
import { replaceTemplateVars } from "./paths";
import type { OnCompleteConfig } from "./schemas";

export async function runOnCompleteHook(
  hookConfig: OnCompleteConfig,
  vars: Record<string, string>,
): Promise<void> {
  const command = replaceTemplateVars(hookConfig.command, vars);

  const proc = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, hookConfig.timeout_ms);

  try {
    const exitCode = await new Promise<number>((resolve) => {
      proc.on("exit", (code) => resolve(code ?? 1));
    });

    if (timedOut) {
      logger.warn(`[hooks] on_complete timed out after ${hookConfig.timeout_ms}ms: ${command}`);
    } else if (exitCode !== 0) {
      const stderrText = Buffer.concat(stderrChunks).toString("utf8");
      const detail = stderrText.trim() ? ` | stderr: ${stderrText.trim()}` : "";
      logger.warn(`[hooks] on_complete failed (exit ${exitCode}): ${command}${detail}`);
    }
  } catch (err) {
    logger.warn(`[hooks] on_complete error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
