import { spawn } from "node:child_process";
import { logger } from "./logger";
import { errorMessage, replaceTemplateVars } from "./paths";
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
      // An unhandled 'error' event is rethrown from the event loop and would kill the process.
      proc.on("error", (err) => {
        logger.warn(`[hooks] on_complete spawn failed: ${errorMessage(err)}`);
        resolve(1);
      });
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
    logger.warn(`[hooks] on_complete error: ${errorMessage(err)}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
