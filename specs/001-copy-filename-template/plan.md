# Implementation Plan: Copy Filename Template & stripDateFromStem Fix

**Branch**: `001-copy-filename-template` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-copy-filename-template/spec.md`

## Summary

Fix `stripDateFromStem` to handle underscore and hyphen separators after leading dates (bug fix), and add an optional `copy_filename` template field to the output config that lets users control how files are named when copied to `copy_to`. The template supports `{date}`, `{stem}`, and `{title}` variables, where `{title}` is extracted from YAML front matter in the processed markdown.

## Technical Context

**Language/Version**: TypeScript (Bun built-in strict mode)
**Primary Dependencies**: zod (schema validation), yaml (YAML parsing, already in deps), openai SDK, p-retry, picomatch
**Storage**: Filesystem only (reads transcripts, writes markdown)
**Testing**: `bun test` (Bun's built-in test runner)
**Target Platform**: macOS/Linux CLI
**Project Type**: CLI tool
**Performance Goals**: N/A - file processing is serial and I/O-bound
**Constraints**: No new dependencies allowed; use existing `yaml` package for front matter parsing
**Scale/Scope**: Single-user CLI, processes files one at a time

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle               | Status | Notes                                                                                                                                  |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| I. Serial Processing    | PASS   | No parallel LLM calls introduced. Template resolution happens after the LLM step completes, within the same serial pipeline.           |
| II. Test-First          | PASS   | Plan requires tests written before implementation for both the bug fix and new feature.                                                |
| III. Bun-Only Runtime   | PASS   | All testing via `bun test`. No new toolchain.                                                                                          |
| IV. Simplicity & YAGNI  | PASS   | Template uses simple string replacement. Front matter extraction reuses existing `yaml` dep. No new abstractions beyond what's needed. |
| V. Conventional Commits | PASS   | Bug fix commit uses `fix:`, feature commit uses `feat:`.                                                                               |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-copy-filename-template/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── schemas.ts           # Add copy_filename to OutputConfigSchema + template validation
├── processor.ts         # Fix stripDateFromStem regex, add template resolution + title extraction to copyOutput

test/
├── processor.test.ts    # Tests for stripDateFromStem fix + copy_filename template rendering
```

### Documentation

```text
README.md                # Add copy_filename to the Configure section's output example
config.example.yaml      # Add copy_filename example (commented out, like copy_to)
CLAUDE.md                # Update processor.ts architecture description to mention template resolution
```

**Structure Decision**: This feature modifies two existing source files (`src/schemas.ts` and `src/processor.ts`), their corresponding test file, and three documentation files. No new files needed. The template resolution logic lives in `processor.ts` alongside the existing `copyOutput` function where it's used.
