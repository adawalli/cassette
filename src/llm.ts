import OpenAI, { APIConnectionError, APIError, RateLimitError } from "openai";
import pRetry, { AbortError } from "p-retry";
import { logger } from "./logger";
import { EnvSchema, type LlmConfig } from "./schemas";
import { sleep } from "./stable-wait";

export interface LlmClient {
  generate(prompt: string, transcriptText: string, llmConfig: LlmConfig): Promise<string>;
}

function getTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        return getTextFromContentPart(part);
      })
      .join("")
      .trim();
  }
  if (typeof content === "object" && content !== null) {
    return getTextFromContentPart(content).trim();
  }
  return "";
}

function getTextFromContentPart(part: unknown): string {
  if (typeof part !== "object" || part === null) {
    return "";
  }

  const candidate = part as { text?: unknown; content?: unknown; value?: unknown };
  if (typeof candidate.text === "string") {
    return candidate.text;
  }
  if (
    typeof candidate.text === "object" &&
    candidate.text !== null &&
    "value" in candidate.text &&
    typeof (candidate.text as { value?: unknown }).value === "string"
  ) {
    return ((candidate.text as { value?: string }).value ?? "").trim();
  }
  if (typeof candidate.content === "string") {
    return candidate.content;
  }
  if (typeof candidate.value === "string") {
    return candidate.value;
  }
  return "";
}

function summarizeChoice(choice: unknown): string {
  if (typeof choice !== "object" || choice === null) {
    return "choice=missing";
  }

  const item = choice as {
    finish_reason?: unknown;
    text?: unknown;
    message?: { content?: unknown; refusal?: unknown } | null;
  };
  const message = item.message ?? undefined;
  const contentKind = Array.isArray(message?.content) ? "array" : typeof message?.content;
  const contentLength = getTextContent(message?.content).length;
  const legacyTextLength = typeof item.text === "string" ? item.text.trim().length : 0;
  const refusalLength = typeof message?.refusal === "string" ? message.refusal.trim().length : 0;

  return [
    `finish_reason=${String(item.finish_reason ?? "unknown")}`,
    `content_kind=${contentKind}`,
    `content_text_len=${contentLength}`,
    `legacy_text_len=${legacyTextLength}`,
    `refusal_len=${refusalLength}`,
  ].join(", ");
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
          temperature: llmConfig.temperature,
          max_tokens: llmConfig.max_tokens,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: transcriptText },
          ],
        });

        const choice = response.choices[0];
        const contentFromMessage = getTextContent(choice?.message?.content);
        const contentFromLegacyText =
          typeof (choice as { text?: unknown } | undefined)?.text === "string"
            ? ((choice as { text?: string }).text ?? "").trim()
            : "";
        const content = contentFromMessage || contentFromLegacyText;
        if (!content) {
          throw new Error(`LLM response did not include text content (${summarizeChoice(choice)})`);
        }
        return content;
      };

      return pRetry(runRequest, {
        retries: llmConfig.retries,
        minTimeout: 0,
        shouldRetry: ({ error }) => isRetryable(error),
        onFailedAttempt: async ({ error, attemptNumber, retriesLeft }) => {
          if (!isRetryable(error)) {
            throw new AbortError(error as Error);
          }
          if (retriesLeft === 0) {
            return;
          }
          if (error instanceof APIError) {
            const retryAfterMsHeader = error.headers?.get("retry-after-ms");
            const retryAfterHeader = error.headers?.get("retry-after");
            const rawMs = retryAfterMsHeader != null ? Number(retryAfterMsHeader) : NaN;
            const rawSeconds = retryAfterHeader != null ? Number(retryAfterHeader) : NaN;
            const serverWaitMs = Number.isFinite(rawMs) && rawMs >= 0
              ? rawMs
              : Number.isFinite(rawSeconds) && rawSeconds >= 0
                ? rawSeconds * 1000
                : 0;
            const backoffMs = llmConfig.retry_delay_ms * Math.pow(2, attemptNumber - 1) * (1 + Math.random());
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
