# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

Use Bun throughout - never Node/npm/pnpm/vite/jest.

- `bun index.ts` to run
- `bun test` to run all tests
- `bun test test/processor.test.ts` to run a single test file
- `bun run typecheck` to typecheck (`tsc --noEmit`) - CI and the pre-push hook both run it
- `bun run install:deps --frozen-lockfile` to install repository dependencies (Bun >=1.3)

`src/` uses only `node:*` APIs so the published bundle runs under Node (`--target node`). Bun-only
APIs (`Bun.file`, `Bun.write`, `Bun.Glob`) are fine in `test/`, never in `src/`.

## Architecture

This is a CLI tool that watches a directory for meeting transcript files (JSON or VTT), extracts transcript segments, sends them to an OpenAI-compatible LLM, and writes cleaned Markdown next to each input file.

**Data flow:**

1. `src/index.ts` - CLI entry point: parses args, loads config, wires up `LlmClient` and delegates to `service.ts`. On SIGINT/SIGTERM it stops the watchers and drains the queue before exiting; a second signal exits immediately.
2. `src/service.ts` - Orchestrates two modes: `runBackfill` (intake + scan + process existing files once) and `runService` (backfill + start watchers). Uses `SerialQueue` to process one file at a time and a `Set<string>` to deduplicate paths.
3. `src/processor.ts` - Core processing per file: waits for file stability, reads the input (JSON or VTT), extracts units, then runs each configured step in order (each step's output is the next step's input and gets its own output file). When `copy_to` is configured, copies the final step's output with optional template-based naming (`copy_filename`) supporting `{{date}}`, `{{stem}}`, and `{{title}}` (title from YAML front matter). A copy failure is logged but does not fail the file. On processing failure, optionally moves the source to a `_failed/` subdirectory and writes an `.error.log`.
4. `src/watcher.ts` - Wraps `node:fs.watch` with `{ recursive: true }` to detect new/changed `.json` and `.vtt` files.
5. `src/intake.ts` - Optional `intake:` stage: watches a source directory (e.g. `~/Downloads`) and moves or copies matching files into `root_dir/<year>/<week-monday>/` before processing. Never re-intakes files already under `root_dir`.
6. `src/extract.ts` - Uses `jsonpath-plus` to extract transcript segments from JSON structures, then renders them as `Speaker: text` lines.
7. `src/vtt-extract.ts` - Parses WebVTT files into transcript units. Handles speaker tags (`<v Speaker>`), merges consecutive cues from the same speaker, and strips timing metadata.
8. `src/llm.ts` - `LlmClient` interface + `createOpenAILlmClient` factory. Uses the `openai` SDK with `p-retry` for retryable errors (rate limits, 5xx, connection errors).
9. `src/hooks.ts` - Runs the optional `on_complete:` shell command after a file finishes, with template variables and a timeout. Failures are logged, never fatal.
10. `src/config.ts` - Loads YAML config via the `yaml` package, validates with Zod, normalizes `prompt`/`steps` into a single `steps` array. Config resolves to `$XDG_CONFIG_HOME/cassette/config.yaml` or `~/.config/cassette/config.yaml`.
11. `src/schemas.ts` - Zod schemas for everything parsed from user input (config, env) plus plain TypeScript types for internally-constructed values (`TranscriptUnit`, `StepResult`, `ProcessingResult`). Single source of truth for the config shape.
12. `src/file-filter.ts` / `src/paths.ts` - Picomatch-based glob filtering (supports `.json` and `.vtt` extensions) and path/error helpers.
13. `src/queue.ts` - `SerialQueue` class: chains promises so tasks run one-at-a-time. Errors are caught per-task so the queue never stalls.
14. `src/stable-wait.ts` / `src/sleep.ts` - Polls a file's size+mtime signature until it stops changing.
15. `src/logger.ts` - Structured logger with `debug/info/warn/error` levels. Level controlled by `LOG_LEVEL` env var (default `info`) or `--debug`.

**Key design constraints:**

- All processing is serial (one file at a time) via `SerialQueue` - intentional to avoid hammering the LLM API.
- The `LlmClient` interface allows tests to inject a mock without hitting the network.
- File stability is polled (size+mtime signature) before processing to handle slow file writes.
- Zod parses untrusted input only (YAML config, env). Values the code constructs itself are plain typed objects - do not add `.parse()` calls on them.
- Skips a file only when **every** step's output already exists, unless `output.overwrite: true`. If some step outputs exist, those steps are read from disk and only the missing ones call the LLM.
- Supports two input formats: JSON (extracted via JSONPath) and WebVTT (parsed natively). Format is determined by file extension.

## Configuration

Config is YAML, validated against `TranscriberConfigSchema` (Zod). Required: `watch.root_dir`, and exactly one of `prompt` or `steps`. Everything else has defaults, including the whole `transcript:` block. The `transcript.path` is a JSONPath expression selecting the array of segments from JSON files - it defaults to `"$[*]"` and is ignored for VTT files. The default `include_glob` is `"**/*.{json,vtt}"`.

Optional blocks: `steps:` (prompt chaining, each step may set `notify: true`), `intake:` (move files in from another directory), `on_complete:` (shell hook), `output.copy_to` / `copy_filename` / `stem_strip` (copy the result elsewhere).

Credentials: `OPENAI_API_KEY` env var (validated via `EnvSchema` at startup). `LOG_LEVEL` (optional, default `info`) controls logger verbosity.

## Tests

Tests live in `test/` and mirror the `src/` module structure. The LLM is always mocked - tests inject a fake `LlmClient`. Run a single test file with `bun test test/<file>.test.ts`.

## Versioning and releases

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases. **Commit message prefixes directly control what version gets published to npm** - always choose the right prefix:

| Prefix                                         | Version bump              | When to use                                                    |
| ---------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| `fix:`                                         | patch (`0.1.0` → `0.1.1`) | Bug fixes, correcting wrong behavior                           |
| `feat:`                                        | minor (`0.1.0` → `0.2.0`) | New user-facing functionality, backwards compatible            |
| `feat!:`                                       | major (`0.1.0` → `1.0.0`) | Breaking changes to config schema, CLI flags, or output format |
| `chore:`, `docs:`, `ci:`, `refactor:`, `test:` | none (changelog only)     | Internal changes with no user impact                           |

A `BREAKING CHANGE:` footer in any commit body also triggers a major bump.

release-please accumulates commits and opens a Release PR. Merging that PR triggers the npm publish automatically. Never manually bump `package.json` or create GitHub Releases.
