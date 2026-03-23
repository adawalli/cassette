# Data Model: Copy Filename Template

## Entities

### OutputConfig (modified)

Existing schema with one new optional field.

| Field             | Type       | Required | Default | Description                                                                   |
| ----------------- | ---------- | -------- | ------- | ----------------------------------------------------------------------------- |
| markdown_suffix   | string     | no       | `.md`   | Suffix for output markdown files                                              |
| overwrite         | boolean    | no       | `false` | Whether to overwrite existing output                                          |
| copy_to           | string     | no       | -       | Directory to copy final output to                                             |
| **copy_filename** | **string** | **no**   | **-**   | **Template for naming copied files. Supports `{{date}}`, `{{stem}}`, `{{title}}`.** |

**Validation rules for copy_filename**:

- If present, MUST be a non-empty string (min length 1)
- MUST only contain known variables: `{{date}}`, `{{stem}}`, `{{title}}`
- Any `{{...}}` token not in the allowed set causes a validation error
- Only meaningful when `copy_to` is also set (no validation error if `copy_to` absent, just unused)

### Template Variables (runtime, not persisted)

| Variable  | Source                                                          | Fallback                | Description                                       |
| --------- | --------------------------------------------------------------- | ----------------------- | ------------------------------------------------- |
| `{{date}}`  | `recordingDateFromFilename()` or `recordingDateFromBirthtime()` | none (always available) | Recording date in YYYY-MM-DD format               |
| `{{stem}}`  | `stripDateFromStem(basename)`                                   | none (always available) | Filename stem with leading/trailing dates removed |
| `{{title}}` | YAML front matter `title` field from final step output          | `{{stem}}` value          | Human-readable title from LLM output              |

## State Transitions

No new state transitions. The `copy_filename` template is resolved once per file during the `copyOutput` step, after the final processing step completes.

## Relationships

- `copy_filename` depends on `copy_to` being set (copy only happens when `copy_to` is configured)
- `{{title}}` depends on the final step's markdown output being available (it always is at `copyOutput` time)
- `{{stem}}` depends on `stripDateFromStem` (the bug fix ensures correct behavior for all separator types)
