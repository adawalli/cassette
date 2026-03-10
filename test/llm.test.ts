import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import type { LlmConfig } from "../src/schemas";

// Capture instances and calls made to the fake OpenAI client
let createArgs: Record<string, unknown>[] = [];
let chatCreateFn: (...args: unknown[]) => Promise<unknown>;

let sleepCalls: number[] = [];
mock.module("../src/stable-wait", () => ({
  sleep: (ms: number) => {
    sleepCalls.push(ms);
    return Promise.resolve();
  },
  waitForStableFile: () => Promise.resolve(),
}));

function defaultChatCreate() {
  return Promise.resolve({
    choices: [{ message: { content: "cleaned transcript" }, finish_reason: "stop" }],
  });
}

// We need to mock 'openai' before importing the module under test.
// Bun's mock.module hoists, so this runs before any import of 'openai'.
mock.module("openai", () => {
  class FakeOpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => {
          createArgs.push(args[0] as Record<string, unknown>);
          return chatCreateFn(...args);
        },
      },
    };
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, { _opts: opts });
    }
  }

  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }

  class RateLimitError extends APIError {
    constructor(message = "rate limited") {
      super(429, message);
      this.name = "RateLimitError";
    }
  }

  class APIConnectionError extends Error {
    constructor(message = "connection error") {
      super(message);
      this.name = "APIConnectionError";
    }
  }

  return {
    default: FakeOpenAI,
    APIError,
    RateLimitError,
    APIConnectionError,
  };
});

// Dynamic import so mock.module is applied first
const { createOpenAILlmClient } = await import("../src/llm");

function baseLlmConfig(overrides?: Partial<LlmConfig>): LlmConfig {
  return {
    base_url: "https://api.openai.com/v1/",
    model: "gpt-4o",
    temperature: 0.2,
    max_tokens: 2000,
    timeout_ms: 30000,
    retries: 2,
    retry_delay_ms: 0,
    ...overrides,
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  chatCreateFn = defaultChatCreate;
  createArgs = [];
  sleepCalls = [];
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
});

describe("createOpenAILlmClient", () => {
  test("throws if OPENAI_API_KEY is not set", () => {
    expect(() => createOpenAILlmClient({})).toThrow();
  });

  test("throws if OPENAI_API_KEY is empty string", () => {
    expect(() => createOpenAILlmClient({ OPENAI_API_KEY: "" })).toThrow();
  });

  test("succeeds when OPENAI_API_KEY is provided", () => {
    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test-key" });
    expect(client).toBeDefined();
    expect(typeof client.generate).toBe("function");
  });
});

describe("generate - LLM configuration", () => {
  test("passes model, temperature, and max_tokens to OpenAI SDK", async () => {
    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const config = baseLlmConfig({ model: "gpt-4o-mini", temperature: 0.7, max_tokens: 1500 });

    await client.generate("system prompt", "user transcript", config);

    expect(createArgs).toHaveLength(1);
    expect(createArgs[0].model).toBe("gpt-4o-mini");
    expect(createArgs[0].temperature).toBe(0.7);
    expect(createArgs[0].max_tokens).toBe(1500);
  });

  test("sends system prompt and user message with correct roles", async () => {
    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });

    await client.generate("You are a transcript cleaner", "Alice: Hello", baseLlmConfig());

    expect(createArgs).toHaveLength(1);
    const messages = createArgs[0].messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: "You are a transcript cleaner" });
    expect(messages[1]).toEqual({ role: "user", content: "Alice: Hello" });
  });
});

describe("generate - response text extraction", () => {
  test("extracts string content from standard response", async () => {
    chatCreateFn = () =>
      Promise.resolve({
        choices: [{ message: { content: "  cleaned output  " }, finish_reason: "stop" }],
      });

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const result = await client.generate("prompt", "input", baseLlmConfig());
    expect(result).toBe("cleaned output");
  });

  test("extracts text from array of content parts", async () => {
    chatCreateFn = () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: [{ text: "part one " }, { text: "part two" }],
            },
            finish_reason: "stop",
          },
        ],
      });

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const result = await client.generate("prompt", "input", baseLlmConfig());
    expect(result).toBe("part one part two");
  });

  test("throws meaningful error when content is null", async () => {
    chatCreateFn = () =>
      Promise.resolve({
        choices: [{ message: { content: null }, finish_reason: "stop" }],
      });

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await expect(client.generate("prompt", "input", baseLlmConfig({ retries: 0 }))).rejects.toThrow(
      "LLM response did not include text content",
    );
  });

  test("throws meaningful error when content is empty string", async () => {
    chatCreateFn = () =>
      Promise.resolve({
        choices: [{ message: { content: "   " }, finish_reason: "stop" }],
      });

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await expect(client.generate("prompt", "input", baseLlmConfig({ retries: 0 }))).rejects.toThrow(
      "LLM response did not include text content",
    );
  });
});

describe("generate - retry behavior", () => {
  test("retries on RateLimitError then succeeds", async () => {
    const { RateLimitError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        throw new RateLimitError("rate limited");
      }
      return Promise.resolve({
        choices: [{ message: { content: "success after retry" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const result = await client.generate("prompt", "input", baseLlmConfig({ retries: 2 }));
    expect(result).toBe("success after retry");
    expect(callCount).toBe(2);
  });

  test("retries on APIConnectionError then succeeds", async () => {
    const { APIConnectionError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        throw new APIConnectionError("connection failed");
      }
      return Promise.resolve({
        choices: [{ message: { content: "reconnected" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const result = await client.generate("prompt", "input", baseLlmConfig({ retries: 2 }));
    expect(result).toBe("reconnected");
    expect(callCount).toBe(2);
  });

  test("retries on generic APIError with status 429 (non-standard rate limit)", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        throw new APIError(429, "Priority-based rate limit exceeded");
      }
      return Promise.resolve({
        choices: [{ message: { content: "success after 429 retry" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    const result = await client.generate("prompt", "input", baseLlmConfig({ retries: 2 }));
    expect(result).toBe("success after 429 retry");
    expect(callCount).toBe(2);
  });

  test("does NOT retry on 401 AuthenticationError - throws immediately", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      throw new APIError(401, "Invalid API key");
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await expect(client.generate("prompt", "input", baseLlmConfig({ retries: 3 }))).rejects.toThrow(
      "Invalid API key",
    );
    // Should only be called once - no retries for auth errors
    expect(callCount).toBe(1);
  });

  test("exhausts all retries and rethrows the last error", async () => {
    const { RateLimitError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      throw new RateLimitError("still rate limited");
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await expect(client.generate("prompt", "input", baseLlmConfig({ retries: 2 }))).rejects.toThrow(
      "still rate limited",
    );
    expect(callCount).toBe(3); // 1 initial + 2 retries
  });

  test("sleeps for retry-after header duration (seconds) before retrying", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        const err = new APIError(429, "rate limited");
        (err as APIError & { headers: Record<string, string> }).headers = { "retry-after": "5" };
        throw err;
      }
      return Promise.resolve({
        choices: [{ message: { content: "success" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await client.generate("prompt", "input", baseLlmConfig({ retries: 2 }));

    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(5000);
  });

  test("sleeps for retry-after-ms header duration before retrying", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        const err = new APIError(429, "rate limited");
        (err as APIError & { headers: Record<string, string> }).headers = { "retry-after-ms": "3000" };
        throw err;
      }
      return Promise.resolve({
        choices: [{ message: { content: "success" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await client.generate("prompt", "input", baseLlmConfig({ retries: 2 }));

    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(3000);
  });

  test("retry-after-ms takes priority over retry-after when both present", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        const err = new APIError(429, "rate limited");
        (err as APIError & { headers: Record<string, string> }).headers = {
          "retry-after": "10",
          "retry-after-ms": "2000",
        };
        throw err;
      }
      return Promise.resolve({
        choices: [{ message: { content: "success" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await client.generate("prompt", "input", baseLlmConfig({ retries: 2, retry_delay_ms: 0 }));

    // retry-after-ms (2000ms) takes priority over retry-after (10s = 10000ms)
    // retry_delay_ms: 0 keeps backoff at zero so only server headers determine wait time
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(2000);
    expect(sleepCalls[0]).toBeLessThan(10000);
  });

  test("does not sleep when retries are exhausted (retriesLeft === 0)", async () => {
    const { RateLimitError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      throw new RateLimitError("still rate limited");
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await expect(
      client.generate("prompt", "input", baseLlmConfig({ retries: 2, retry_delay_ms: 100 })),
    ).rejects.toThrow("still rate limited");

    expect(callCount).toBe(3); // 1 initial + 2 retries
    // Should only sleep before retries that will actually happen (2 sleeps, not 3)
    expect(sleepCalls).toHaveLength(2);
  });

  test("falls back to backoff when retry-after header is malformed", async () => {
    const { APIError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount === 1) {
        const err = new APIError(429, "rate limited");
        (err as APIError & { headers: Record<string, string> }).headers = {
          "retry-after": "not-a-number",
        };
        throw err;
      }
      return Promise.resolve({
        choices: [{ message: { content: "success" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await client.generate("prompt", "input", baseLlmConfig({ retries: 2, retry_delay_ms: 100 }));

    expect(sleepCalls).toHaveLength(1);
    // Should use backoff (100ms * 2^0 * [1,2) = [100, 200)), not NaN
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(100);
    expect(sleepCalls[0]).toBeLessThan(200);
  });

  test("falls back to exponential backoff when no retry-after header", async () => {
    const { RateLimitError } = await import("openai");
    let callCount = 0;

    chatCreateFn = () => {
      callCount++;
      if (callCount <= 2) throw new RateLimitError();
      return Promise.resolve({
        choices: [{ message: { content: "success" }, finish_reason: "stop" }],
      });
    };

    const client = createOpenAILlmClient({ OPENAI_API_KEY: "sk-test" });
    await client.generate("prompt", "input", baseLlmConfig({ retries: 3, retry_delay_ms: 100 }));

    // attempt 1: 100 * 2^0 * [1,2) → [100, 200)
    // attempt 2: 100 * 2^1 * [1,2) → [200, 400)
    expect(sleepCalls).toHaveLength(2);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(100);
    expect(sleepCalls[0]).toBeLessThan(200);
    expect(sleepCalls[1]).toBeGreaterThanOrEqual(200);
    expect(sleepCalls[1]).toBeLessThan(400);
  });
});
