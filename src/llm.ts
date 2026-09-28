import OpenAI, { APIConnectionError, APIError, RateLimitError } from "openai";
import pRetry from "p-retry";
import { logger } from "./logger";
import { EnvSchema, type LlmConfig } from "./schemas";
import { sleep } from "./sleep";

export interface LlmClient {
  /** Generates a response from the LLM. Throws on permanent failures (non-retryable API errors, auth failures). */
  generate(prompt: string, transcriptText: string, llmConfig: LlmConfig): Promise<string>;
}

function getTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  // Some OpenAI-compatible backends return an array of content parts instead of a string.
  if (Array.isArray(content)) {
    return content.map(getTextFromContentPart).join("").trim();
  }
  return "";
}

function getTextFromContentPart(part: unknown): string {
  const text = (part as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : "";
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RateLimitError || error instanceof APIConnectionError) {
    return true;
  }
  if (error instanceof APIError && typeof error.status === "number") {
    return error.status >= 500 || error.status === 429;
  }
  return false;
}

export function createOpenAILlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const parsedEnv = EnvSchema.parse({
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  });

  return {
    async generate(prompt: string, transcriptText: string, llmConfig: LlmConfig): Promise<string> {
      const client = new OpenAI({
        apiKey: parsedEnv.OPENAI_API_KEY,
        baseURL: llmConfig.base_url,
        timeout: llmConfig.timeout_ms,
        maxRetries: 0,
      });

      const runRequest = async (): Promise<string> => {
        const response = await client.chat.completions.create({
          model: llmConfig.model,
          ...(llmConfig.temperature === null ? {} : { temperature: llmConfig.temperature }),
          max_tokens: llmConfig.max_tokens,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: transcriptText },
          ],
        });

        const choice = response.choices[0];
        const content = getTextContent(choice?.message?.content);
        if (!content) {
          throw new Error(
            `LLM response did not include text content (finish_reason=${choice?.finish_reason ?? "unknown"}, refusal=${choice?.message?.refusal ?? "none"})`,
          );
        }
        return content;
      };

      return pRetry(runRequest, {
        retries: llmConfig.retries,
        minTimeout: 0,
        shouldRetry: ({ error }) => isRetryable(error),
        onFailedAttempt: async ({ error, attemptNumber, retriesLeft }) => {
          // p-retry calls onFailedAttempt even on the final failure; skip delay when no retry will follow
          if (retriesLeft === 0) {
            return;
          }
          if (error instanceof APIError) {
            const retryAfterMsHeader = error.headers?.get("retry-after-ms");
            const retryAfterHeader = error.headers?.get("retry-after");
            const rawMs = retryAfterMsHeader != null ? Number(retryAfterMsHeader) : NaN;
            const rawSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : NaN;
            const serverWaitMs =
              Number.isFinite(rawMs) && rawMs >= 0
                ? rawMs
                : Number.isFinite(rawSeconds) && rawSeconds >= 0
                  ? rawSeconds * 1000
                  : 0;
            const backoffMs =
              llmConfig.retry_delay_ms * Math.pow(2, attemptNumber - 1) * (1 + Math.random());
            const waitMs = Math.max(serverWaitMs, backoffMs);
            logger.debug(
              `LLM rate limit hit, will retry: status=${error.status}, attempt=${attemptNumber}, retriesLeft=${retriesLeft}, waitMs=${Math.round(waitMs)}`,
            );
            await sleep(waitMs);
          }
        },
      });
    },
  };
}
