# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

Use Bun throughout - never Node/npm/pnpm/vite/jest.

- `bun index.ts` to run
- `bun test` to run all tests
- `bun test test/processor.test.ts` to run a single test file
- `bun install` to install dependencies

## Architecture

This is a CLI tool that watches a directory for meeting transcript files (JSON or VTT), extracts transcript segments, sends them to an OpenAI-compatible LLM, and writes cleaned Markdown next to each input file.

**Data flow:**

1. `src/index.ts` - CLI entry point: parses args, loads config, wires up `LlmClient` and delegates to `service.ts`
2. `src/service.ts` - Orchestrates two modes: `runBackfill` (scan+process existing files once) and `runService` (backfill + start watcher). Uses `SerialQueue` to process one file at a time and a `Set<string>` to deduplicate in-flight paths.
3. `src/processor.ts` - Core processing per file: waits for file stability, reads the input (JSON or VTT), extracts units, calls LLM, writes `.md` output. When `copy_to` is configured, copies the final output with optional template-based naming (`copy_filename`) that supports `{{date}}`, `{{stem}}`, and `{{title}}` variables (title extracted from YAML front matter). On failure, optionally moves the source file to a `_failed/` subdirectory and writes an `.error.log`.
4. `src/watcher.ts` - Wraps `node:fs.watch` with `{ recursive: true }` to detect new/changed `.json` and `.vtt` files.
5. `src/extract.ts` - Uses `jsonpath-plus` to extract transcript segments from JSON structures, then renders them as `Speaker: text` lines.
6. `src/vtt-extract.ts` - Parses WebVTT files into transcript units. Handles speaker tags (`<v Speaker>`), merges consecutive cues from the same speaker, and strips timing metadata.
7. `src/llm.ts` - `LlmClient` interface + `createOpenAILlmClient` factory. Uses the `openai` SDK with `p-retry` for retryable errors (rate limits, 5xx, connection errors).
8. `src/config.ts` - Loads YAML config via `yaml package`, validates with Zod. Config resolves to `$XDG_CONFIG_HOME/cassette/config.yaml` or `~/.config/cassette/config.yaml`.
9. `src/schemas.ts` - All Zod schemas and derived TypeScript types. Single source of truth for the config shape and processing result types.
10. `src/file-filter.ts` / `src/paths.ts` - Picomatch-based glob filtering (supports `.json` and `.vtt` extensions) and path helpers.
11. `src/queue.ts` - `SerialQueue` class: chains promises so tasks run one-at-a-time. Errors are caught per-task so the queue never stalls.
12. `src/logger.ts` - Structured logger with `debug/info/warn/error` levels. Level controlled by `LOG_LEVEL` env var (default `info`).

**Key design constraints:**

- All processing is serial (one file at a time) via `SerialQueue` - intentional to avoid hammering the LLM API.
- The `LlmClient` interface allows tests to inject a mock without hitting the network.
- File stability is polled (size+mtime signature) before processing to handle slow file writes.
- Skips files where the output `.md` already exists unless `output.overwrite: true`.
- Supports two input formats: JSON (extracted via JSONPath) and WebVTT (parsed natively). Format is determined by file extension.

## Configuration

Config is YAML, validated against `TranscriberConfigSchema` (Zod). Required fields: `watch.root_dir`, `prompt`. Everything else has defaults. The `transcript.path` is a JSONPath expression selecting the array of segments from JSON files - it defaults to `"$[*]"` and is ignored for VTT files. The default `include_glob` is `"**/*.{json,vtt}"`.

Credentials: `OPENAI_API_KEY` env var (validated via `EnvSchema` at startup). `LOG_LEVEL` (optional, default `info`) controls logger verbosity.

## Tests

Tests live in `test/` and mirror the `src/` module structure. The LLM is always mocked - tests inject a fake `LlmClient`. Run a single test file with `bun test test/<file>.test.ts`.

## Versioning and releases

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases. **Commit message prefixes directly control what version gets published to npm** - always choose the right prefix:

| Prefix | Version bump | When to use |
|--------|-------------|-------------|
| `fix:` | patch (`0.1.0` → `0.1.1`) | Bug fixes, correcting wrong behavior |
| `feat:` | minor (`0.1.0` → `0.2.0`) | New user-facing functionality, backwards compatible |
| `feat!:` | major (`0.1.0` → `1.0.0`) | Breaking changes to config schema, CLI flags, or output format |
| `chore:`, `docs:`, `ci:`, `refactor:`, `test:` | none (changelog only) | Internal changes with no user impact |

A `BREAKING CHANGE:` footer in any commit body also triggers a major bump.

release-please accumulates commits and opens a Release PR. Merging that PR triggers the npm publish automatically. Never manually bump `package.json` or create GitHub Releases.
