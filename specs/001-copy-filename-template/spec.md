# Feature Specification: Copy Filename Template & stripDateFromStem Fix

**Feature Branch**: `001-copy-filename-template`
**Created**: 2026-03-23
**Status**: Draft
**Input**: Bug fix for stripDateFromStem underscore handling + new copy_filename template feature for output naming

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Correct output naming for underscore-separated files (Priority: P1)

A user has meeting transcript files named with underscore separators (e.g., `2026-03-20_weekly-standup.vtt`). When cassette processes these files and copies the output to a `copy_to` directory, the date gets duplicated in the filename because `stripDateFromStem` only strips dates followed by whitespace. The user expects the copied file to be named `2026-03-20 weekly-standup.md`, not `2026-03-20 2026-03-20_weekly-standup.md`.

**Why this priority**: This is a bug that produces incorrect output filenames today. It affects any user with underscore- or hyphen-separated filenames, which is a common naming convention. Must be fixed before building new naming features on top.

**Independent Test**: Process a file named `2026-03-20_weekly-standup.vtt` with `copy_to` configured and verify the copied filename does not contain a duplicate date.

**Acceptance Scenarios**:

1. **Given** a file named `2026-03-20_weekly-standup.vtt` and `copy_to` is configured, **When** cassette processes the file, **Then** the copied output is named `2026-03-20 weekly-standup.md`
2. **Given** a file named `2026-03-20-team-sync.json` and `copy_to` is configured, **When** cassette processes the file, **Then** the copied output is named `2026-03-20 team-sync.md`
3. **Given** a file named `2026-03-20 team sync.vtt` (space-separated, existing behavior), **When** cassette processes the file, **Then** the copied output is named `2026-03-20 team sync.md` (no regression)

---

### User Story 2 - Custom output filename via template (Priority: P2)

A user wants control over how copied output files are named. They add a `copy_filename` template string to their config (e.g., `"{{date}} {{title}}"`). When cassette processes a transcript and the LLM produces markdown with a `title` field in the YAML front matter, the copied file uses that title instead of the raw filename stem.

**Why this priority**: This is a new feature that builds on the bug fix. It gives users flexibility in output naming, especially useful when filenames are machine-generated but the LLM produces human-readable titles.

**Independent Test**: Configure `copy_filename: "{{date}} {{title}}"`, process a transcript whose LLM output contains `title: Weekly Standup` in front matter, and verify the copied file is named `2026-03-20 Weekly Standup.md`.

**Acceptance Scenarios**:

1. **Given** config has `copy_filename: "{{date}} {{title}}"` and the processed markdown has `title: Weekly Standup` in front matter, **When** cassette copies the output, **Then** the file is named `2026-03-20 Weekly Standup.md`
2. **Given** config has `copy_filename: "{{date}} {{title}}"` and the processed markdown has no front matter, **When** cassette copies the output, **Then** `{{title}}` falls back to `{{stem}}` and the file is named `2026-03-20 weekly-standup.md`
3. **Given** config has `copy_filename: "{{date}} {{title}}"` and the processed markdown has front matter but no `title` field, **When** cassette copies the output, **Then** `{{title}}` falls back to `{{stem}}`
4. **Given** config has no `copy_filename` field, **When** cassette copies the output, **Then** behavior is unchanged from current default (`{{date}} {{stem}}.md`)

---

### User Story 3 - Template variable combinations (Priority: P3)

A user wants to use different combinations of template variables to match their personal file organization. They can use `{{date}}`, `{{stem}}`, and `{{title}}` in any order with any separators.

**Why this priority**: Extends the template feature to cover less common but valid naming preferences. Depends on the core template machinery from US2.

**Independent Test**: Configure `copy_filename: "{{stem}} - {{date}}"` and verify the output filename matches the template pattern.

**Acceptance Scenarios**:

1. **Given** config has `copy_filename: "{{stem}} - {{date}}"`, **When** cassette copies the output, **Then** the file is named `weekly-standup - 2026-03-20.md`
2. **Given** config has `copy_filename: "{{title}}"` (date omitted), **When** cassette copies the output, **Then** the file is named `Weekly Standup.md`
3. **Given** config has `copy_filename: "{{date}} {{stem}} {{title}}"`, **When** cassette copies the output with `title: Weekly Standup` and stem `weekly-standup`, **Then** the file is named `2026-03-20 weekly-standup Weekly Standup.md`

---

### Edge Cases

- What happens when `copy_filename` contains an unknown variable like `{{foo}}`? Config validation MUST reject it at load time with a clear error message.
- What happens when `{{title}}` resolves to an empty string? It MUST fall back to `{{stem}}`.
- What happens when the resolved filename contains characters invalid for the filesystem (e.g., `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)? Those characters MUST be replaced with `-`, with consecutive `-` collapsed and leading/trailing `-` trimmed.
- What happens when `copy_filename` is an empty string? Config validation MUST reject it.
- What happens when the resolved filename after template expansion is just whitespace? It MUST fall back to the default naming behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `stripDateFromStem` MUST strip a leading date when followed by `_`, `-`, or whitespace (not just whitespace)
- **FR-002**: `stripDateFromStem` MUST preserve existing behavior for space-separated dates (no regression)
- **FR-003**: The `output` config section MUST accept an optional `copy_filename` string field
- **FR-004**: When `copy_filename` is omitted, the copy naming behavior MUST remain unchanged (current `{{date}} {{stem}}.md` pattern)
- **FR-005**: The template MUST support three variables: `{{date}}`, `{{stem}}`, and `{{title}}`
- **FR-006**: `{{date}}` MUST resolve to the recording date in `YYYY-MM-DD` format (already extracted from filename or birthtime)
- **FR-007**: `{{stem}}` MUST resolve to the filename stem after `stripDateFromStem` processing (existing behavior)
- **FR-008**: `{{title}}` MUST resolve to the `title` field from YAML front matter in the final step's processed markdown output
- **FR-009**: `{{title}}` MUST fall back to `{{stem}}` when front matter is absent, unparseable, or lacks a `title` field
- **FR-010**: Config validation MUST reject `copy_filename` templates containing unknown variables (anything other than `{{date}}`, `{{stem}}`, `{{title}}`)
- **FR-011**: Config validation MUST reject an empty `copy_filename` string
- **FR-012**: The `.md` extension MUST be appended automatically to the resolved template output

### Key Entities

- **Copy Filename Template**: An optional string in the output config containing `{{variable}}` placeholders that control copied output file naming
- **Recording Date**: A `YYYY-MM-DD` date string extracted from the input filename or file birthtime, used as `{{date}}`
- **Stem**: The input filename without extension and without leading date, used as `{{stem}}`
- **Title**: A string extracted from YAML front matter in the processed markdown, used as `{{title}}`

## Assumptions

- The YAML front matter in processed markdown follows standard format: `---` delimiters with `title: value` on its own line. The existing `yaml` dependency or a simple regex can extract this without adding new dependencies.
- Filesystem-invalid characters in resolved filenames are rare since titles come from LLM output which typically produces clean text. A simple sanitization pass is sufficient.
- The `copy_filename` template is evaluated after the final processing step completes, so the markdown content is available for front matter extraction.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Files with underscore-separated dates produce correctly named copies without date duplication (0 duplicate-date filenames)
- **SC-002**: Files with hyphen-separated dates produce correctly named copies without date duplication
- **SC-003**: Existing space-separated date filenames continue to work identically (no regressions)
- **SC-004**: Users can configure a `copy_filename` template and receive output files named according to their template
- **SC-005**: Invalid templates are rejected at config load time, before any files are processed
- **SC-006**: All template variables resolve correctly, with `{{title}}` falling back to `{{stem}}` when front matter is unavailable
