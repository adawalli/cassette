# Tasks: Copy Filename Template & stripDateFromStem Fix

**Input**: Design documents from `/specs/001-copy-filename-template/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included per plan.md constitution check (Test-First: PASS).

**Organization**: Tasks grouped by user story. US1 is a bug fix, US2/US3 build the template feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project structure needed. This feature modifies existing files only. Verify current state.

- [x] T001 Verify existing test suite passes with `bun test`
- [x] T002 Read current `src/processor.ts` to understand `stripDateFromStem` and `copyOutput` functions
- [x] T003 [P] Read current `src/schemas.ts` to understand `OutputConfigSchema` shape

---

## Phase 2: Foundational

**Purpose**: No foundational/blocking infrastructure needed. Both source files already exist. Proceed directly to user stories.

**Checkpoint**: Setup verified - user story implementation can begin.

---

## Phase 3: User Story 1 - Correct output naming for underscore-separated files (Priority: P1) MVP

**Goal**: Fix `stripDateFromStem` to handle `_` and `-` separators after leading dates, eliminating duplicate-date filenames.

**Independent Test**: Process a file named `2026-03-20_weekly-standup.vtt` with `copy_to` configured and verify the copied filename is `2026-03-20 weekly-standup.md` (no duplicate date).

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [US1] Add test: `stripDateFromStem` strips leading date with underscore separator (`2026-03-20_weekly-standup` -> `weekly-standup`) and `copyOutput` produces `2026-03-20 weekly-standup.md` (space comes from copyOutput interpolation, not the regex) in test/processor.test.ts
- [x] T005 [US1] Add test: `stripDateFromStem` strips leading date with hyphen separator (`2026-03-20-team-sync` -> `team-sync`) in test/processor.test.ts
- [x] T006 [US1] Add test: `stripDateFromStem` still strips leading date with space separator (no regression) in test/processor.test.ts
- [x] T007 [US1] Run tests and verify T004/T005 FAIL (Red phase confirmation)

### Implementation for User Story 1

- [x] T008 [US1] Fix `stripDateFromStem` leading-date regex from `\s+` to `[\s_-]+` in src/processor.ts
- [x] T009 [US1] Run tests and verify T004-T006 all PASS (Green phase confirmation)

**Checkpoint**: US1 complete. Files with underscore/hyphen separators produce correct output names. Commit with `fix:` prefix.

---

## Phase 4: User Story 2 - Custom output filename via template (Priority: P2)

**Goal**: Add optional `copy_filename` template field to output config. Support `{{date}}`, `{{stem}}`, `{{title}}` variables with title extracted from YAML front matter.

**Independent Test**: Configure `copy_filename: "{{date}} {{title}}"`, process a transcript whose LLM output contains `title: Weekly Standup` in front matter, verify copied file is named `2026-03-20 Weekly Standup.md`.

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [P] [US2] Add test: `copy_filename` template with `{{date}} {{title}}` resolves correctly when front matter has title in test/processor.test.ts
- [x] T011 [P] [US2] Add test: `{{title}}` falls back to `{{stem}}` when markdown has no front matter in test/processor.test.ts
- [x] T012 [P] [US2] Add test: `{{title}}` falls back to `{{stem}}` when front matter exists but has no `title` field in test/processor.test.ts
- [x] T013 [P] [US2] Add test: omitting `copy_filename` preserves default `{{date}} {{stem}}.md` naming in test/processor.test.ts
- [x] T014 [P] [US2] Add test: config validation rejects `copy_filename` with unknown variables like `{{foo}}` in test/processor.test.ts
- [x] T015 [P] [US2] Add test: config validation rejects empty `copy_filename` string in test/processor.test.ts
- [x] T016 [P] [US2] Add test: resolved filename has filesystem-invalid characters replaced with `-` (e.g., `Q1: Planning` -> `Q1- Planning`) in test/processor.test.ts
- [x] T016a [P] [US2] Add test: `{{title}}` falls back to `{{stem}}` when front matter has `title: ""` (empty string value) in test/processor.test.ts
- [x] T016b [P] [US2] Add test: `copy_filename` set without `copy_to` is silently accepted (no validation error) in test/processor.test.ts
- [x] T017 [US2] Run tests and verify T010-T016b FAIL (Red phase confirmation)

### Implementation for User Story 2

- [x] T018 [US2] Add optional `copy_filename` string field to `OutputConfigSchema` with Zod `.refine()` validation for allowed variables in src/schemas.ts
- [x] T019 [US2] Add `extractTitleFromMarkdown` function using `yaml` package to parse front matter title in src/processor.ts
- [x] T020 [US2] Add `resolveTemplate` function with `replaceAll` for `{{date}}`, `{{stem}}`, `{{title}}` substitution in src/processor.ts
- [x] T021 [US2] Add `sanitizeFilename` function to replace filesystem-invalid characters with `-` in src/processor.ts
- [x] T022 [US2] Integrate template resolution into `copyOutput`: resolve template, sanitize, append `.md` in src/processor.ts
- [x] T023 [US2] Run tests and verify T010-T016b all PASS (Green phase confirmation)

**Checkpoint**: US2 complete. Users can configure `copy_filename` templates with title extraction from front matter. Commit with `feat:` prefix.

---

## Phase 5: User Story 3 - Template variable combinations (Priority: P3)

**Goal**: Verify and ensure template variables work in any order and combination.

**Independent Test**: Configure `copy_filename: "{{stem}} - {{date}}"` and verify the output filename matches the pattern.

### Tests for User Story 3

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T024 [P] [US3] Add test: `copy_filename: "{{stem}} - {{date}}"` produces `weekly-standup - 2026-03-20.md` in test/processor.test.ts
- [x] T025 [P] [US3] Add test: `copy_filename: "{{title}}"` (no date) produces `Weekly Standup.md` in test/processor.test.ts
- [x] T026 [P] [US3] Add test: `copy_filename: "{{date}} {{stem}} {{title}}"` with stem `weekly-standup` and title `Weekly Standup` produces exactly `2026-03-20 weekly-standup Weekly Standup.md` in test/processor.test.ts
- [x] T027 [P] [US3] Add test: resolved filename that is only whitespace falls back to default naming in test/processor.test.ts
- [x] T028 [US3] Run tests and verify new tests FAIL where implementation is missing (Red phase)

### Implementation for User Story 3

- [x] T029 [US3] Add whitespace-only fallback to `resolveTemplate` in src/processor.ts
- [x] T030 [US3] Run tests and verify T024-T027 all PASS (Green phase confirmation)

**Checkpoint**: US3 complete. All template variable combinations work correctly. Commit with `feat:` prefix (or amend US2 commit if preferred).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and final validation

- [x] T031 [P] Add `copy_filename` example to output section in README.md
- [x] T032 [P] Add commented `copy_filename` example to config.example.yaml
- [x] T033 [P] Update processor.ts architecture description to mention template resolution in CLAUDE.md
- [x] T034 Run full test suite with `bun test` to verify no regressions
- [x] T035 Run quickstart.md scenarios manually to validate end-to-end behavior
- [x] T036 Run `/code-review` and apply any recommendations
- [x] T037 Run `/simplify` and apply any recommendations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - verify current state
- **Foundational (Phase 2)**: N/A - no blocking infrastructure needed
- **US1 (Phase 3)**: Can start immediately after setup. BLOCKS US2 (template feature builds on correct `stripDateFromStem`)
- **US2 (Phase 4)**: Depends on US1 completion (template `{{stem}}` uses the fixed `stripDateFromStem`)
- **US3 (Phase 5)**: Depends on US2 completion (extends the template machinery)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent - bug fix to existing function
- **US2 (P2)**: Depends on US1 (correct stem extraction needed for `{{stem}}` variable)
- **US3 (P3)**: Depends on US2 (extends template resolution with edge cases)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Red phase)
- Implementation makes tests pass (Green phase)
- Commit at each checkpoint

### Parallel Opportunities

- T002/T003: Read source files in parallel during setup
- T010-T016: All US2 test tasks can be written in parallel (same file, different test cases)
- T024-T027: All US3 test tasks can be written in parallel
- T031-T033: All documentation updates can run in parallel

---

## Parallel Example: User Story 2

```bash
# Write all US2 tests in parallel (all in test/processor.test.ts but independent test cases):
Task: "Add test: copy_filename template with {{date}} {{title}} resolves correctly"
Task: "Add test: {{title}} falls back to {{stem}} when no front matter"
Task: "Add test: config validation rejects unknown variables"
Task: "Add test: config validation rejects empty copy_filename"
Task: "Add test: filesystem-invalid characters sanitized"

# Then implement sequentially (each builds on prior):
Task: "Add copy_filename to OutputConfigSchema in src/schemas.ts"
Task: "Add extractTitleFromMarkdown in src/processor.ts"
Task: "Add resolveTemplate in src/processor.ts"
Task: "Add sanitizeFilename in src/processor.ts"
Task: "Integrate template resolution into copyOutput in src/processor.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify tests pass)
2. Phase 2: N/A
3. Complete Phase 3: US1 - fix stripDateFromStem
4. **STOP and VALIDATE**: Run tests, verify bug fix works
5. Commit with `fix: strip underscore and hyphen separators in stripDateFromStem`

### Incremental Delivery

1. US1 (bug fix) -> Commit as `fix:` -> patch release
2. US2 (template feature) -> Commit as `feat:` -> minor release
3. US3 (variable combinations) -> Commit with US2 or separate `feat:`
4. Polish (docs) -> Commit as `docs:`
5. Each story adds value without breaking previous stories

### Suggested Commit Sequence

| Step | Prefix | Description |
|------|--------|-------------|
| US1 | `fix:` | Strip underscore and hyphen separators after leading date in stripDateFromStem |
| US2+US3 | `feat:` | Add copy_filename template with {{date}}, {{stem}}, {{title}} variables |
| Polish | `docs:` | Document copy_filename template in README and config example |
