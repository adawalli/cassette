# Research: Copy Filename Template & stripDateFromStem Fix

## R1: stripDateFromStem regex fix

**Decision**: Extend the leading-date regex from `\s+` to `[\s_-]+` to also consume underscore and hyphen separators after the date.

**Rationale**: The current regex `^\d{4}-\d{2}-\d{2}\s+` only matches a leading date followed by whitespace. Files like `2026-03-20_weekly-standup.vtt` don't match, so the full stem (including date) passes through, causing `copyOutput` to produce `2026-03-20 2026-03-20_weekly-standup.md`. The trailing-date regex already handles `-` via `[-\s]*`, so only the leading pattern needs the fix.

**Alternatives considered**:

- Separate regexes for each separator type: Rejected - single character class `[\s_-]+` is simpler and handles all cases.
- Normalize separators before stripping: Rejected - unnecessary complexity, just widen the match.

## R2: YAML front matter title extraction

**Decision**: Use the existing `yaml` package (already a project dependency) to parse front matter from the final step's markdown output. Extract the `title` field.

**Rationale**: The processed markdown already contains YAML front matter delimited by `---`. The `yaml` package is already in `dependencies` for config parsing. A simple split on the first two `---` markers, then `yaml.parse()` on the content between them, gives us the title with no new dependencies.

**Alternatives considered**:

- Regex-only extraction (`/^title:\s*(.+)$/m`): Would work for simple cases but breaks on quoted titles, multiline values, or YAML edge cases. Since we already have `yaml`, use it.
- New dependency (e.g., `gray-matter`): Rejected per constitution (simplicity, no unnecessary deps).

## R3: Template validation strategy

**Decision**: Validate `copy_filename` at config load time in `src/schemas.ts` using a Zod `.refine()` on the `OutputConfigSchema`. Extract all `{{...}}` tokens from the template and reject any not in the allowed set (`date`, `stem`, `title`) using `{{var}}` double-brace syntax (consistent with `on_complete` command templates).

**Rationale**: Fail-fast at config load prevents confusing runtime errors during file processing. Zod refinement keeps validation co-located with the schema definition, consistent with the existing codebase pattern.

**Alternatives considered**:

- Runtime validation during `copyOutput`: Rejected - user wouldn't see the error until a file is processed, which could be hours after startup.
- Custom Zod schema type: Rejected - overkill for a single string field with a simple constraint.

## R4: Template resolution approach

**Decision**: Simple string replacement via `String.prototype.replaceAll()` for each variable. No template engine.

**Rationale**: Three fixed variables with simple string substitution. A template engine would violate the simplicity principle. `replaceAll` is available in all supported runtimes.

**Alternatives considered**:

- Template literal engine (e.g., handlebars): Rejected - massive overkill for 3 variables.
- Regex-based replacement: Works but `replaceAll` is cleaner for literal strings.

## R5: Filesystem-invalid character sanitization

**Decision**: Replace characters that are invalid in common filesystems (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) with `-`. Collapse multiple consecutive `-` into one. Trim leading/trailing `-` and whitespace.

**Rationale**: Titles from LLM output are generally clean text, but edge cases (colons in titles like "Q1: Planning") need handling. Replacing with `-` preserves readability. This is consistent with how most file-naming tools handle sanitization.

**Alternatives considered**:

- Strip invalid characters entirely: Can produce confusing results (e.g., "Q1 Planning" from "Q1: Planning" loses the separator).
- Reject filenames with invalid characters: Poor UX - the user can't control what the LLM puts in the title.
