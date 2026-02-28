import { logger } from "./logger";
import type { OnCompleteConfig } from "./schemas";

export function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export async function runOnCompleteHook(
  hookConfig: OnCompleteConfig,
  vars: Record<string, string>,
): Promise<void> {
  const command = replaceTemplateVars(hookConfig.command, vars);

  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "ignore",
    stderr: "pipe",
  });

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, hookConfig.timeout_ms);

  try {
    const exitCode = await proc.exited;

    if (timedOut) {
      logger.warn(`[hooks] on_complete timed out after ${hookConfig.timeout_ms}ms: ${command}`);
    } else if (exitCode !== 0) {
      const stderrText = await new Response(proc.stderr).text();
      const detail = stderrText.trim() ? ` | stderr: ${stderrText.trim()}` : "";
      logger.warn(`[hooks] on_complete failed (exit ${exitCode}): ${command}${detail}`);
    }
  } catch (err) {
    logger.warn(`[hooks] on_complete error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
